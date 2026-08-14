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

1. **Restore oversized-child capping for tables** *(done 2026-08-10)* —
   replaced the `max-height: none !important; overflow: visible !important`
   tbody override with a page-aware cap:
   `tbody { max-height: var(--rm-max-content-child-height, 300px) !important; overflow-y: auto !important }`
   (`packages/vue/src/styles/index.css`). The variable is what the plugin
   recomputes each layout pass (= page content height − 10px); the 300px
   fallback is the plugin's own default. Kept `display: table !important` and
   `table-layout: fixed !important` on the table itself — both are required by
   `ManualColumnResize` (it drives layout from `<colgroup col>` widths under
   `table-layout: fixed`); only the tbody cap was the problem. Verified column
   resize still applies (`ManualColumnResize` writes to `colgroup col`/`td`,
   neither affected by a tbody `max-height`).
   - Note on why the cap must be in docflow CSS, not the plugin's: docflow's
     `CustomTable.renderHTML` (`packages/plugins/src/table.ts`) renders a plain
     `<table>` with no `.table-plus` class, so the plugin's
     `.table-plus td/th { max-height: var(--rm-max-content-child-height) }`
     rule never matches our tables; the only active plugin cap was
     `tbody { max-height: 300px }`, which the old override deleted.
   - Symptom mapping (confirmed by reading `PaginationPlus.js:144-194,546,404`):
     with no tbody cap and the Stage 1.2 patch in place, the freeze became a
     graceful-but-ugly overflow — a tall table rendered as one uncapped block
     past the last page divider ("overflowing page, not A4"), and the
     float-based `.rm-page-break` spacers misaligned against it ("lots of empty
     space" after a paste). Both are gone with the cap restored.
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

**Followup after Stage 1.1 (2026-08-10): "blank space" around pasted tables
is a CSS problem, not a paste-pipeline problem.** After the pagination cap
was restored, a pasted GDocs table no longer froze or overflowfed, but a
screenshot still showed (a) blank space above the table, (b) overly tall
rows, (c) blank space below. Investigation:

- The normalized pipeline output for the GDocs-table fixture is **just the
  `<table>`** — no leading/trailing empty paragraphs (the 5 empty `<p>` in the
  fixture are the "Notes" column cells, which *must* stay because
  prosemirror-tables requires every cell to have block content).
- Confirmed with a real-schema editor test (`tablePlugin` loaded): pasting a
  table into a heading yields `[heading, table]` (no empty `<p>` above), and
  into an empty paragraph yields `[table]` (no empty `<p>` above or below).
  **Both paste paths (`insertContent` and native slice) produce clean node
  structure.** The blank space is purely visual.
- Root cause of the visual puffiness: `.ProseMirror p { margin: 0.5rem 0 }`
  and `.ProseMirror ul/ol { margin: 0.5rem 0 }` apply globally, so every
  paragraph/list inside a cell stacked a full top+bottom margin on top of the
  cell's own `0.5rem 0.75rem` padding ≈ doubling row height. Fixed in
  `packages/vue/src/styles/index.css`: cell-internal `p`/`ul`/`ol` get
  `margin: 0.125rem 0`, and `td/th > :first-child/:last-child` collapse their
  outer margin. No change to the paste pipeline was needed or warranted.

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

## 8. Status log (2026-08-10, end of day)

### Done

- **Stage 1 merged to `development`** (PR #186): patch guard v1 (oversized
  last element + 1000-page circuit breaker), tbody CSS kept at PR #61
  semantics (height capping tbody is a no-op on table boxes and
  `display: table` tbody breaks ManualColumnResize), Dockerfiles copy
  `patches/`.
- **Stage 2 pipeline implemented** (this branch,
  `wip/paste-pipeline-stage2`): `packages/core/src/pasteNormalization.ts`
  (DOM-based; `sanitizePastedHTML` kept as alias), 26 tests green incl. the
  real GDocs fixture (`src/__tests__/fixtures/clipboard/google-docs-table.html`).
  Output quality verified visually: clean equal-width columns, lists and
  structure intact — a big improvement over the old regex output.

### NOT solved — the pagination runaway is architectural

Guard iterations v1→v3 each caught one runaway variant, and each richer
input found another (real GDocs clipboard froze again; a persisted doc made
with the new pipeline froze *on load*). Stop patching heuristics.

Root design flaw: `calculatePageCount` (PaginationPlus dist) computes the
next page count from **the positions of the previous cycle's injected
decorations** (`lastElementChild` bottom vs last `.breaker` bottom) — a
feedback loop. PaginationPlus's float-spacer page simulation assumes
content flows around zero-width floats; **block-level tables violate that**:
with docflow's `display: table !important` override (needed by
ManualColumnResize), a table clears below the whole spacer stack, so its
bottom is always below the last breaker → gap never closes (or grows by one
spacer per cycle) → unbounded growth. The plugin's own table scheme
(`table { display: contents }`, capped `tbody`) exists to make tables flow
like text; docflow's override disables it.

Observed symptoms of this one flaw: tab freeze (28k `.rm-page-break`),
page-count multiplying, table rendered starting below page 1, page number
floating mid-page, "Page 2 of 1" status mismatch, colwidth attrs written
back into cells during DOM churn.

### Stage 1.5 (next work item) — feedforward measurement

Patch `calculatePageCount` (or wrap the plugin) so page count derives from
**decoration-free content height**, not breaker positions:

- `packages/layout-engine/src/PageLayout.ts:286-302` already renders a
  hidden offscreen shadow clone of the content (`-9999px`,
  `visibility: hidden`) for measurement — reuse or replicate that approach.
- `pageCount = max(1, ceil(contentHeight / pageContentAreaHeight))` where
  contentHeight is measured on the clone (no spacers, no breakers) → pure
  feedforward → converges by construction for any content.
- Oversized single nodes (tall table) then deterministically get
  `ceil(tableHeight / area)` pages and simply overflow visually — no loop
  possible.
- Keep the 1000-page circuit breaker as the last resort.

Alternative (bigger): adopt the plugin's `display: contents` table scheme
and re-validate ManualColumnResize geometry against it.

### Current stable state for daily dev

Working tree on `main`: patches/ + pnpm-workspace.yaml + pnpm-lock.yaml
(uncommitted, the Stage 1 guard) + main's original index.css. Stage 2 files
live only on `wip/paste-pipeline-stage2`. Do NOT run the new pipeline
against tall tables in production until Stage 1.5 lands.

## 9. Status log (2026-08-10, late session) — paste table blank space

### Root cause confirmed via live DevTools measurement

After Stage 1.1 (tbody cap), a pasted GDocs tracker table still showed a
large blank band above the table. Traced to ground by measuring the live DOM:

- The table (6 rows) rendered at **1012px tall — taller than one A4 page**
  (page content area = 1005px). Pagination correctly bumps a too-tall block
  to the next page, so the whole table jumped to top=1236 (page 2 start),
  leaving page 1's remaining content area (~930px) as the visible "blank
  space above the table."
- **Why the table was too tall:** cells contain 6-item bullet lists. Each
  `<li>` rendered at 51px = **two lines** because the long first-column text
  ("KAK/Request for Proposal document", 33 chars) wrapped in a 308px column.
  308px = 606px content width / 3 equal columns.
- **Why equal columns:** the paste pipeline strips source `<style>` (which
  holds GDocs class-based widths `.c24/.c39/.c14`) for safety, so no width
  signal survives. ProseMirror tables with no `colwidth` rendered under
  `table-layout: fixed` → equal columns → narrow first column → text wraps →
  rows double in height → table exceeds one page.
- **Stage 1.1's tbody `max-height` cap is a no-op.** Verified live:
  `tbody.maxHeight=995px` (computed) but `tbody` rendered at 1011px with no
  scroll. `max-height`/`overflow` are ignored on `display: table-row-group`
  (the default `<tbody>` box); they only apply to block-level boxes. The
  plugin's cap works only under its own `table { display: contents }` +
  `tbody { display: table }` re-boxing, which docflow overrides (for
  ManualColumnResize). The cap never worked; the patch convergence guard is
  the real freeze prevention.

### Fix applied — content-based column auto-sizing

- `packages/plugins/src/table.ts` `CustomTable.renderHTML`: tag the rendered
  `<table>` with `data-colwidth="explicit"` when cells carry `colwidth` (i.e.
  widths were set by paste-from-inline-width-sources or by ManualColumnResize).
- `packages/vue/src/styles/index.css`: default tables to `table-layout: auto`
  (columns size to content); scope `table-layout: fixed !important` to
  `table[data-colwidth='explicit']`. Result: a pasted table with no widths
  gives the wide first column enough room that long list items don't wrap,
  halving row height and keeping the table within one page. ManualColumnResize
  sets `colwidth` via transaction on drag, flipping the table to fixed layout.
- Removed the misleading `max-height`/`overflow-y` from `tbody` (no-op on
  table-row-group) with a comment recording the finding.
- Tests: `packages/plugins/src/__tests__/tableLayout.test.ts` (3 cases) —
  `data-colwidth` present/absent/invalid. All suites green (core 110, plugins 87).

### Remaining known issue — tables taller than one page (Epic: cross-page table breaking)

The auto-sizing fix keeps *most* pasted tables within one page, but a table
that is genuinely taller than one page (many rows, or unavoidable long
content) **cannot split across pages** with the current PaginationPlus plugin.
The plugin's float-spacer pagination treats a table as an atomic block; it
has no row-level page-boundary model. Symptoms of this limit:

- A table taller than the remaining page-1 space jumps wholesale to page 2
  (page 1 shows its unfilled bottom as blank space) — what was reported here.
- There is no row-split at the page boundary (Google Docs / Word behavior).

This is **out of scope for the paste fix** and tracked as a separate epic:

1. **Approach A — node splitting (document-level):** at layout time, measure
   each `<tr>` against the page boundary; when a row would overflow, split the
   table node into two table nodes (page-1 portion + page-2 portion) via a
   ProseMirror decoration or a view plugin. Pros: prints correctly, no scroll.
   Cons: complex; editing across the split boundary (selection, enter-key,
   undo) is hard; must keep the two halves in sync on every edit.
2. **Approach B — CSS fragmentation (rendering-level):** use
   `break-inside: avoid` on rows + a non-float pagination model
   (`break-after: page`), so the browser's native table fragmentation splits
   rows across pages. Requires replacing or heavily patching PaginationPlus's
   float-spacer engine (it conflicts with native CSS breaks). Bigger but
   cleaner long-term; aligns with the §8 "Stage 1.5 feedforward" proposal.
3. **Approach C — accept + cap:** keep current behavior (table jumps to next
   page if it doesn't fit) and document it as expected. Cheapest; acceptable
   if tables-taller-than-a-page are rare.

Decision deferred. Recommended next investigation: prototype Approach B on a
branch, since the float-spacer engine is already the source of the runaway
(§8) and a CSS-break-based engine would fix both at once.
