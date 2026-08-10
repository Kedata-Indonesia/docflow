# Clipboard Paste Pipeline & Pagination Readback Fix

## 1. Goal

Pasting content from any external source — Google Docs, Word/DOCX clipboard,
Notion, web pages, Markdown viewers — must be **safe** (never freezes the
tab, never corrupts the document) and **predictable** (source typography is
normalized to docflow styles; semantic structure and color/highlight survive).

This plan covers two coupled problems exposed by the same repro:

1. **The freeze/readback bug (fire).** Pasting a Google Docs table hard-wedges
   the browser tab (main thread never yields; even devtools calls time out).
   Smaller tables don't freeze but **duplicate themselves** — and the
   duplication is persisted to MongoDB. This is a pagination ↔ ProseMirror
   DOM-readback loop, not a paste problem per se; any sufficiently tall
   content can trigger it.
2. **The paste pipeline (root hygiene).** Paste handling is a regex-based
   string sanitizer (`sanitizePastedHTML`) bolted onto ProseMirror's native
   clipboard parse. It handles exactly the Google Docs cases someone already
   fought; there is no source detection, no DOM-level normalization, no
   Markdown path, and no fixture tests.

## 2. Problem

### Repro (verified 2026-08-10, local dev)

Copy the single tracker table from a Google Doc
(`docs.google.com/document/d/1LECpCDrLVe9b1mILENBW4GXMtejQ8-cZiFKx5cY84WM`),
paste into docflow → the tab freezes completely (JS unresponsive, Jam
recording impossible because the browser itself wedges). In Google Docs the
same table fits one page; in docflow it would span several (docflow body
default is 16px vs GDocs ~11pt Arial).

Controlled experiment (Playwright, empty doc, synthetic paste of a **2×2**
table — far below freeze threshold):

- `pageBreaks` grew from **2 → 28,392** `.rm-page-break` elements.
- Tables in the live DOM kept **doubling between probes** (1 → 2 → 4 tables,
  2 → 12 → 24 rows) with no user input — an active self-amplification loop.
- The **persisted** document in MongoDB ended with 2 tables / 12 rows —
  proof the duplication is written back into the real document, not just
  decoration DOM. (`rm-page-break` elements did **not** persist — the schema
  filters them; the tables do persist.)
- Server-side fallout: continuous `500` on `/api/collab/heartbeat` while the
  loop ran.

### Root cause (freeze) — confirmed mechanism (2026-08-10 deep dive)

PaginationPlus simulates pages with **widget decorations**, not content
splitting: a single widget at document position 0 (`#pages
.rm-pages-wrapper`, `dist/PaginationPlus.js:582-668`) renders N
`.rm-page-break` elements, each a `float: left` spacer whose
`marginTop = pageContentAreaHeight` pushes content down to fake page frames.

Page count is derived geometrically in `calculatePageCount`
(`PaginationPlus.js:526-566`): compare the bottom of
`editorDom.lastElementChild` against the bottom of the last `.breaker`;
if content extends below it, add `ceil(gap / pageContentAreaHeight)` pages.
There is **no convergence guard**.

The plugin's own defense against oversized children is CSS it injects
(`PaginationPlus.js:141-194`): cap child heights
(`max-height: var(--rm-max-content-child-height)`), cap table bodies
(`tbody { max-height: 300px; overflow-y: auto }`), so no single node can
exceed the page content area and the geometric page count always converges.

**docflow disables exactly that defense.** `packages/vue/src/styles/index.css:312-327`:

```css
.rm-with-pagination table, .ProseMirror table { display: table !important; ... }
.rm-with-pagination table tbody, .ProseMirror table tbody {
  display: table-row-group !important;
  max-height: none !important;   /* kills the 300px cap */
  overflow: visible !important;  /* kills internal scroll */
}
```

With the cap gone, a table taller than one page is **unsplittable and
uncapped**: its bottom is always below the last breaker's bottom →
`calculatePageCount` adds pages every cycle → each cycle rebuilds ~6 DOM
nodes per page-break → N grows into the thousands (measured: 28,392
`.rm-page-break` elements from a 2×2 table paste) → ~170k-element
decoration rebuilds wedge the main thread (the GDocs table froze the tab
instantly; even Playwright/CDP calls timed out).

**Document corruption path:** during runaway decoration rebuilds,
ProseMirror's mutation observer reconciles the churning DOM against the
document and re-parses content regions — duplicating table nodes into the
**actual document** (verified persisted in MongoDB: 2 tables / 12 rows from
one 2×2 paste). The `.rm-page-break` decorations themselves never persist
(PM widgets are doc-invisible); the duplicated content does.

(Earlier claim corrected: PaginationPlus is not "table-blind" — it has
CSS-based table height capping that docflow overrides. The override was
presumably added to fix table rendering (`table-layout: fixed` for our
custom column resize), not knowing it removed the convergence mechanism.)

### Root cause (paste fragility)

- `sanitizePastedHTML` (`packages/core/src/Editor.ts:33-103`) is regex
  string surgery on HTML: strips `<meta>/<style>/<link>/<base>/<title>`/
  comments, rewrites GDocs background spans to `<mark>`, strips
  `<b style="font-weight:normal">` wrappers (note: it strips **all** `</b>`
  closing tags globally — works because GDocs wraps everything in such a
  `<b>`, but mangles legitimate `<b>` markup), removes `docs-internal-*` ids.
- Two paste entry points share it: native Ctrl+V via
  `transformPastedHTML` (`Editor.ts:712`) and the toolbar action
  `handlePaste` (`packages/vue/src/components/DocsEditor.vue:1630`, with
  plain-text fallback at `:1640-1650`).
- No source detection (Word/Notion/generic web get the GDocs treatment), no
  Markdown handling, no typography normalization (source font sizes flow in
  raw — part of why GDocs content overflows pages).

## 3. Decisions

- **Paste normalizes typography to destination styles.** Strip source
  fonts/sizes/line-heights on paste; keep semantic structure (headings,
  lists, tables) and color/highlight/bold/italic/links. Rationale: docflow
  owns page layout (16px body, page margins); preserving source typography
  is what made a 1-page GDocs table explode into multi-page content. This is
  also what Google Docs' own "paste without formatting + keep structure"
  does. If we later want "keep source look," it must be an explicit
  per-paste choice, not the default.
- **One pipeline for all HTML sources.** Word, GDocs, Notion and web
  clipboards are all hostile HTML; source detection only tunes which
  wrapper-stripping rules run. No per-source parsers.
- **Build in-house, not Tiptap Pro.** Tiptap's
  `@tiptap-pro/extension-paste-handler` covers much of Stage 2 (Office
  cleanup, GDocs bg→highlight, table cell styles, list reconstruction) but
  is a paid Pro extension: private-registry token through CI + Docker +
  Dokploy, closed source in a core editing path. Evaluated and rejected
  2026-08-10 — we implement the equivalent transformations ourselves. It
  also would not cover Notion, Markdown, or Stage 1 regardless.
- **Markdown is opt-in by detection.** `text/plain` that clearly looks like
  Markdown (headings, `- [ ]`, pipe tables) goes through MD→HTML→pipeline;
  ambiguous plain text stays plain. Never surprise-convert.
- **Fix the readback loop before the pipeline.** A nicer sanitizer still
  feeds the same wedging renderer.

## 4. Stages

### Stage 1 — Pagination readback fix (the fire)

The seam is confirmed (see §2): our `index.css` table overrides disable
PaginationPlus's oversized-child height caps, so `calculatePageCount` never
converges on tall tables, and PM readback during the runaway corrupts the
document. Fix in three layers:

1. **Restore oversized-child capping for tables** — remove the
   `max-height: none !important; overflow: visible !important` tbody
   override (`packages/vue/src/styles/index.css:322-327`) and re-cap tall
   tables the way the plugin intends (tbody internal scroll), OR scope our
   `display: table !important` override so it doesn't fight the plugin's
   capping. Verify our custom column-resize still works
   (`ManualColumnResize` in `packages/core/src/Editor.ts` — the reason the
   `table-layout: fixed` rule exists).
2. **Add a convergence guard regardless** (defense in depth) — wrap/patch
   so page count grows by at most +1 per cycle and is hard-capped (e.g.
   500 pages); if the cap is hit, disable pagination for the session
   (`enabled: false` + `rm-pagination-disabled`) and warn. The package is
   an npm dependency — use `pnpm patch tiptap-pagination-plus@3.1.0` to add
   the guard inside `calculatePageCount`/`getNewPageCount`; keep the patch
   minimal and documented here.
3. **Verify the readback disappears with the loop gone** — the document
   corruption was a symptom of runaway DOM churn; if any readback remains
   after convergence, investigate PM `ignoreMutation` boundaries for the
   decoration wrapper separately.

Acceptance: the GDocs tracker table pastes without freezing; a 2×2 table
paste results in exactly 1 table / 2 rows in the **persisted** document;
`.rm-page-break` count stabilizes within a second; reload shows no
duplication.

### Stage 2 — DOM-based paste normalization pipeline

Replace regex surgery in `packages/core/src/Editor.ts`:

```
clipboardData['text/html']
  → DOMParser → inert Document
  → detectSource(): 'google-docs' | 'word' | 'notion' | 'generic'
      (docs-internal-guid / Mso* + <o:p> / notion markers / default)
  → normalize(root, source): walk the tree
      keep: p, h1-h6, ul/ol/li, table/tr/td/th, img, a,
            marks: b/strong, i/em, u, s, color, highlight, link
      strip: meta/style/link/base/title/comments, script, iframe, form
      unwrap (keep children): b[font-weight:normal], o:p, font, nested
            span chains, div→p conversion, source font-size/font-family/
            line-height/margin styles
      table rules: drop col/row spans our schema can't express (or expand
            them), strip fixed pixel widths (schema/CSS owns layout)
  → serialize → ProseMirror parse (existing transformPastedHTML hook)
```

- Keep the exported name `sanitizePastedHTML` (or add
  `normalizeClipboardHTML` and deprecate) so `DocsEditor.vue` and
  `transformPastedHTML` wiring don't churn.
- Both paste paths (native Ctrl+V, toolbar paste) automatically share it.
- My regex-behavior regression tests
  (`packages/core/src/__tests__/sanitizePastedHTML.test.ts`, written
  2026-08-10) stay green by reimplementing them against the DOM pipeline;
  the "all `</b>` stripped" quirk is explicitly dropped and covered by a
  "legitimate bold survives" test.

### Stage 3 — Markdown paste

- In `handlePaste`/native path: when only `text/plain` is available and it
  scores high on Markdown signals (`^#{1,6} `, `- [ ]`, `| a | b |`,
  fenced code), convert MD → HTML (check `packages/export` for an existing
  MD dependency before adding one) → Stage 2 pipeline.
- Plain text below the confidence threshold inserts as-is (current
  behavior).

### Stage 4 — Fixture regression suite

- `packages/core/src/__tests__/fixtures/clipboard/`: real captured payloads —
  `google-docs-table.html` (today's 3.8KB capture), `google-docs-text.html`,
  `word-list.html`, `notion-page.html`, `markdown.md`.
- Tests: pipeline output matches expected schema JSON (snapshot or targeted
  asserts); pasted document contains exactly one copy of the content;
  pipeline completes < 100ms for a 100KB payload (guards regex/loop
  blowups); a table taller than one page does not freeze pagination
  (Stage 1 acceptance encoded as a test where feasible — may need a
  Playwright e2e in `e2e/` for real layout).

## 5. Critical files

- `packages/core/src/Editor.ts` — `sanitizePastedHTML` (:33-103) → DOM
  pipeline; `transformPastedHTML` hook (:712).
- `packages/vue/src/components/DocsEditor.vue` — `handlePaste` (:1630),
  `handlePastePlain` (:1663), `paginationOptions` (:225-248).
- `packages/vue/src/styles/index.css` — `.rm-page-break` rules, table rules
  (:312-324).
- `packages/plugins/src/table.ts` — table extension config (column resizing
  already disabled).
- `packages/core/src/__tests__/sanitizePastedHTML.test.ts` — existing
  regression tests to port onto the new pipeline.
- New: `packages/core/src/__tests__/fixtures/clipboard/*` (fixtures),
  possibly `e2e/` Playwright spec for the freeze acceptance.

## 6. Verification

1. `pnpm --filter @kedata-indonesia/docflow-core test:unit` — pipeline +
   fixture tests green.
2. `pnpm --filter @kedata-indonesia/docflow-vue typecheck` and vue unit
   suite green.
3. Playwright repro of today's exact scenario: paste the GDocs tracker
   table → no freeze; exactly one table in the document; persisted Mongo
   content has exactly one copy; page count stable.
4. Manual: paste from GDocs (text + table), Word/DOCX clipboard, a Markdown
   viewer → structure intact, destination typography, one-page content stays
   one page (modulo real content height at 16px).
5. Reload the document after paste — content unchanged (no readback
   residue).

## 7. Out of scope

- DOCX **file** import (mammoth.js-style) — separate feature; this plan is
  clipboard-only.
- "Keep source formatting" paste mode — possible later per-paste option on
  top of the Stage 2 pipeline.
- The `/api/collab/heartbeat` 500s observed during the runaway — likely a
  victim of gigantic sync payloads; re-check after Stage 1, file separately
  if it persists on normal content.
