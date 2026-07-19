# Phase 5 — Export (PDF / DOCX) · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 5 · **Priority:** P1 · **Depends on:** Phase 2 · **Last updated:** 2026-07-19

> **Goal:** Google-Docs-grade export. **PDF** reuses the existing pagination model
> (`layout-engine`) so page breaks in the file match what the user sees on screen.
> **DOCX** maps the ProseMirror/TipTap schema to Office Open XML (headings, lists,
> tables, images, alignment). Both are exposed as **library export hooks** and wired to an
> `apps/web` "Download as…" action. The library never imports backend concerns; ProseMirror
> state remains the single source of truth.

---

## 1. Current State (what exists today)

Export is **substantially implemented** — all 8 formats produce output. PDF is no longer stubbed to bare `window.print()`; the print stylesheet has been enhanced to preserve pagination and force light mode. The implementation lives in the demo app, not as a reusable library package.

### Where the code lives

| Layer | File | What |
|-------|------|------|
| **Export engine** | [`apps/demo/src/utils/export.ts`](../../apps/demo/src/utils/export.ts) (406 lines) | All 8 format handlers: `exportDocument(format, editor, title)` |
| **Demo wiring** | [`apps/demo/src/components/EditorView.vue:273-282`](../../apps/demo/src/components/EditorView.vue) | `@export="handleExport"` → calls `exportDocument()` |
| **HeaderBar menu** | [`packages/vue/src/components/HeaderBar.vue:40,98-123`](../../packages/vue/src/components/HeaderBar.vue) | 8 "Download" menu items (DOCX/PDF/ODT/TXT/RTF/HTML-ZIP/HTML/Markdown) + Print |
| **DocsEditor forward** | [`packages/vue/src/components/DocsEditor.vue:60,715`](../../packages/vue/src/components/DocsEditor.vue) | Emit widened to all 8 formats; `@export="$emit('export', $event)"` |
| **Print CSS** | [`packages/vue/src/styles/index.css:666-850`](../../packages/vue/src/styles/index.css), [`apps/demo/src/styles/index.css:254-437`](../../apps/demo/src/styles/index.css) | Comprehensive `@media print` rules (hide chrome, reset layout, preserve breaks) |

### By format: what's implemented

| Format | Status | Method | Quality |
|--------|--------|--------|---------|
| **Markdown** | Implemented | `prosemirror-markdown` serializer with plain-text fallback | Full (unsupported nodes/marks degrade gracefully) |
| **HTML** | Implemented | Wrapped in full HTML document template → blob download | Full |
| **HTML-ZIP** | Implemented | JSZip with HTML inside | Full |
| **TXT** | Implemented | HTML → `innerText` extraction | Full |
| **DOCX** | Implemented | HTML → OOXML via `docx` library (paragraphs, headings, lists, tables, text formatting) | Good — HTML-based (not PM JSON-based). No footnotes, page breaks, or images yet. |
| **PDF** | Implemented | `window.print()` + enhanced print CSS | Good — preserves editor pagination and forces light mode; browser header/footer still visible |
| **ODT** | Implemented | In-memory ODF ZIP generation (plain-text) | Basic — flat text, no rich formatting |
| **RTF** | Implemented | Plain-text RTF generation | Basic — flat text, no rich formatting |

### Print CSS enhancements (2026-07-19)

The `@media print` rules in both stylesheet copies were updated to:

- **Preserve editor pagination:** `[data-rm-pagination]` and `.rm-page-break > .page` are kept visible so the browser prints the same page breaks the user sees on screen.
- **Hide spacers and breakers:** `.rm-page-break > .page` (empty spacers) and `.rm-page-break > .breaker` (visual separators) are hidden to avoid blank pages.
- **Force light mode:** `.docs-editor__paper`, `.ProseMirror`, and all descendants are forced to `background: #ffffff; color: #000000` regardless of the app's dark-mode state.
- **Responsive overrides scoped to screen:** The responsive pagination rules (`max-width: 100vw`, `width: 100%`, `padding: 16px`) are now wrapped in `@media screen` so they do not interfere with print output.
- **`@page` binding:** `@page { size: A4; margin: 20mm; }` sets the physical page geometry.

**Note on html2pdf.js:** An initial implementation attempted to use `html2pdf.js` to generate a downloadable `.pdf` directly. It was abandoned because the rendered `.page` elements produced by `tiptap-pagination-plus` are **empty spacers** (their only job is `marginTop` to create page height), not content containers. The library was removed from `apps/demo/package.json` and the plan now follows the intended `window.print()` + print-CSS path.

### Implementation approach: HTML-based, not PM JSON-based

The current DOCX mapper (`htmlToDocxDocument`, [`export.ts:274-335`](../../apps/demo/src/utils/export.ts)) **parses HTML** from `editor.getHTML()`, not ProseMirror JSON. It traverses DOM nodes to build `docx` library objects:

- `elementToDocxParagraph()` — maps `<p>`, `<h1>`–`<h6>`, `<blockquote>`, `<pre>/<code>` → `docx.Paragraph`
- `childrenToTextRuns()` — maps inline HTML (`<strong>`, `<em>`, `<u>`, `<s>`, `<code>`) → `docx.TextRun`
- `tableToDocxTable()` — maps HTML `<table>` → `docx.Table`
- `listToDocxParagraphs()` — maps `<ul>/<ol>` → flat `docx.Paragraph` list (not native OOXML numbering)

**Limitations of the HTML-based approach:**
- **No `pageBreak` mapping.** Page break nodes are not mapped to OOXML page breaks.
- **No `footnote` mapping.** Footnotes render as plain `'1'` text in HTML, not as OOXML footnotes.
- **No image embedding.** Images are not embedded as OOXML `ImageRun` — they appear as broken references.
- **No rich ODF/RTF.** ODT and RTF export only plain text, not styled content.
- **Tied to the demo app.** The export logic lives in `apps/demo/`, not in a reusable `packages/export/`.

### Key existing assets we build on

- **Pagination model (for PDF).** `PageLayout` measures rendered block DOM and `PageBreaker.computePages()` returns `Page[]` [PageBreaker.ts:13-159](../../packages/layout-engine/src/PageBreaker.ts). Breaks account for margins, force-breaks (`pageBreak` node), oversized-block isolation, and mid-paragraph splitting [PageLayout.ts:80-105](../../packages/layout-engine/src/PageLayout.ts). **DOM-measurement based — browser only.**
- **Page geometry.** `PAGE_SIZES` (A4/F4/Letter/Legal/A5 in px @96dpi) in [layout-engine/types.ts:55-61](../../packages/layout-engine/src/types.ts).
- **Serialization entry points.** `DocsEditor.getJSON()` / `getHTML()` / `getText()` ([Editor.ts:134-135](../../packages/core/src/Editor.ts)).
- **Node/mark set.** `defaultPlugins` ([plugins/index.ts:29-43](../../packages/plugins/src/index.ts)): StarterKit marks, headings, lists, alignment, link, image, table, blockquote, codeBlock, `pageBreak`, `footnote`, fontSize.
- **Print CSS** ([packages/vue/src/styles/index.css:666-850](../../packages/vue/src/styles/index.css)): hides chrome, resets layout, preserves page breaks — ready for a real PDF pass.
- **PageView** renders per-page DOM from `Page[]` ([PageView.vue](../../packages/vue/src/components/PageView.vue)).

### What does NOT exist yet

| Gap | Detail |
|-----|--------|
| `packages/export/` | The headless export library proposed in §3 does not exist. |
| `packages/vue/src/export/` | No `pdf.ts` orchestration helper. |
| `onExport` prop | `DocsEditor` has no `onExport` prop — only the `@export` emit. |
| PM JSON → DOCX | Current DOCX is HTML-based; a PM JSON-based serializer is the target. |
| `pageBreak` → OOXML | Not mapped in DOCX export. |
| `footnote` → OOXML | Not mapped; renders as plain `'1'`. |
| Image embedding | Not implemented in any export format. |
| Server-side PDF | No Puppeteer endpoint in `apps/server`. |
| `apps/web` | Does not exist (no project for it yet). |

---

## 2. Target Architecture

Two independent pipelines from one source of truth. **PDF follows the on-screen page model; DOCX is a schema map that lets Word repaginate.** The current implementation is a working prototype in the demo app — the target is to **extract it into a reusable library package** and fill the remaining gaps.

```
                    ProseMirror doc (single source of truth)
                     DocsEditor.getJSON()  ·  rendered PageView DOM
                                    │
             ┌──────────────────────┴───────────────────────┐
             ▼                                               ▼
   ══════════ PDF path ══════════            ══════════ DOCX path ══════════
   (page-accurate, DOM-derived)              (schema map, Word repaginates)

   layout-engine Page[]  (existing)          PM JSON  ─►  PMDocxSerializer
        │  page geometry + breaks                 │   (packages/export, headless)
        ▼                                         │   node/mark → docx elements
   render each Page to print-CSS DOM             ▼
   @page size/margins from PAGE_SIZES      docx library builds OOXML
        │                                    (Paragraph/Table/ImageRun/…)
        ▼                                         │
   CLIENT default:  window.print()               ▼
     → "Save as PDF"  (zero backend)        Blob (.docx)  ─► download
        │                                    CLIENT default (no browser needed)
   SERVER optional (apps/web):
     Puppeteer/Chromium renders the same
     print route → deterministic PDF bytes
        │
        ▼
   Blob / stream ─► "Download as…" action ◄───────────────┘
   (apps/web HeaderBar @export consumer; library exposes the hooks)
```

### Current → Target Gap

| Aspect | Current (prototype) | Target |
|--------|---------------------|--------|
| **Where** | `apps/demo/src/utils/export.ts` | `packages/export/` (headless) + `packages/vue/src/export/pdf.ts` (browser PDF) |
| **DOCX mapper** | HTML-parsing (`htmlToDocxDocument`) | PM JSON schema walk (`PMDocxSerializer`) |
| **pageBreak** | Not mapped | OOXML `PageBreak()` |
| **footnote** | Not mapped | OOXML `FootnoteReferenceRun` |
| **Image** | Not mapped | OOXML `ImageRun` via `resolveImage()` |
| **ODT/RTF** | Plain-text only | Rich format (styled text, tables, images) |
| **PDF** | `window.print()` | Print-CSS orchestrated (`exportPdf()`) + optional Puppeteer server |
| **Hook** | `@export` emit only | `@export` emit + `onExport` prop for host override |

### Design decisions

1. **PDF = browser rendering, not hand-drawn.** Same as original plan — reuse `layout-engine` data and print CSS.
2. **DOCX = evolved from HTML-based to PM JSON-based.** The current HTML parser works but loses PM semantics (pageBreak, footnote nodes are invisible in HTML). The target `PMDocxSerializer` walks PM JSON directly for full fidelity.
3. **The library owns the hooks; the app owns the wiring.** Move export logic from `apps/demo` → `packages/export` + `packages/vue`. App provides "Download as…" UI, filenames, optional Puppeteer endpoint.
4. **`pageBreak` and `footnote` are first-class in both formats.** PDF honors force-breaks
   (already in `PageBreaker`); DOCX maps `pageBreak` → an OOXML page break and `footnote` →
   a real Word footnote (its `attrs.content` string becomes the note body). Phase 6 later
   upgrades footnote content from string to `sourceId`; the mapper is written to tolerate both.

5. **ODT and RTF remain in the demo app.** These formats are working in the demo but are not the
   priority for library extraction. They stay as-is in `apps/demo/`; future work may upgrade them
   to rich format and move them to `packages/export/`.

---

## 3. Export-Hook Interface

New headless package **`packages/export`** (`@kedata-indonesia/docflow-export`), built with `tsup` like other leaf packages, depending only on `docx` + the schema types — **no** Vue, **no** backend.

> **Current state:** This package does not exist yet. The `ExportFormat` type below matches what's already defined in [`apps/demo/src/utils/export.ts:22`](../../apps/demo/src/utils/export.ts). The types in this section are the **target** interface after extraction.

```ts
// packages/export/src/types.ts
export type ExportFormat = 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf'

export interface PageGeometry {
  sizeId: string            // 'a4' | 'letter' | 'legal' | …  (from PAGE_SIZES)
  pageWidth: number         // px @96dpi
  pageHeight: number
  margins: { top: number; bottom: number; left: number; right: number }
  orientation?: 'portrait' | 'landscape'
}

export interface ExportContext {
  /** ProseMirror/TipTap document JSON — the single source of truth. */
  doc: object
  title: string
  geometry: PageGeometry
  /** Resolve an image URL (self-hosted, Phase 2/4) to raw bytes for embedding.
   *  Injected by the host so the library never assumes a storage backend. */
  resolveImage?: (src: string) => Promise<{ data: Uint8Array; mime: string; width?: number; height?: number }>
}

export interface ExportResult {
  blob: Blob               // or Buffer when run server-side
  filename: string
  mime: string
}

```ts
// packages/vue/src/export/pdf.ts  (browser-only PDF orchestration — needs the DOM)
export interface PdfPrintOptions {
  geometry: PageGeometry
  pages: import('@kedata-indonesia/docflow-layout-engine').Page[]
  editorDom: HTMLElement
  /** false (default) = window.print(); true = POST to server Puppeteer endpoint. */
  server?: { endpoint: string }
}
export function exportPdf(opts: PdfPrintOptions): Promise<void | ExportResult>
```

```ts
// The library-facing hook, threaded through DocsEditor props (extends the Phase 0/2 contract)
export interface DocsEditorExportHooks {
  /** Called by the "Download as…" action. If absent, DocsEditor uses its
   *  built-in client defaults (print-CSS PDF / docx blob download). */
  onExport?: (format: ExportFormat, ctx: ExportContext) => Promise<void> | void
  resolveImage?: ExportContext['resolveImage']
}
```

The existing `@export` emit ([DocsEditor.vue:54,662](../../packages/vue/src/components/DocsEditor.vue)) is **widened** from `'markdown' | 'html' | 'txt'` to include `'pdf' | 'docx'`; the built-in handler runs the library defaults, and `onExport` (when provided) lets the host override (e.g. route PDF to the server).

---

## 4. Task Breakdown

Tasks updated to reflect current code. **✅ = done**, **⬜ = not started**, **🔄 = partially done (in demo, needs extraction to library)**.

### Group A — PDF (page-accurate, browser-rendered)

**A1. Scaffold `packages/export` + shared types.** ⇐ none · ⬜
- Files: `packages/export/{package.json,tsup.config.ts,tsconfig.json}` (new), `packages/export/src/types.ts` (new, §3 types), `packages/export/src/index.ts` (new).
- `dependencies`: `docx`; devDeps mirror other leaf packages. **No** Vue/server deps.
- Accept: `pnpm --filter @kedata-indonesia/docflow-export build` + `typecheck` pass.

**A2. Extract & enhance print stylesheet.** ✅ Done (partially)
- **Done:** Comprehensive `@media print` rules in [`packages/vue/src/styles/index.css:666-850`](../../packages/vue/src/styles/index.css) and [`apps/demo/src/styles/index.css:254-437`](../../apps/demo/src/styles/index.css). Updated 2026-07-19 to preserve pagination, hide spacers, and force light mode.
- **Remaining:** Extract into `packages/vue/src/export/print.css`. Add dynamic `@page { size: <w> <h>; margin: ... }` generated from the active `PAGE_SIZES` entry (px→mm conversion @96dpi). De-duplicate the demo copy.
- Accept: printing a 3-page doc to "Save as PDF" produces exactly 3 pages with margins matching the editor; a `pageBreak` node lands on a fresh page.

**A3. `exportPdf()` client orchestration (replace bare `window.print`).** ⇐ A2 · ⬜
- Files: `packages/vue/src/export/pdf.ts` (new); wire into [`DocsEditor.vue:485`](../../packages/vue/src/components/DocsEditor.vue).
- Client path: ensure layout is settled (await `PageLayout.layout(immediate)`), toggle `printing` body class that activates `print.css`, call `window.print()`, restore on `afterprint`. Use the already-rendered `PageView` DOM — do **not** re-measure.
- Accept: "Cetak…"/PDF export renders page-accurate output; force-breaks and mid-paragraph splits match on-screen pagination; no editor chrome in the PDF.

**A4. Server-side deterministic PDF via Puppeteer.** ⇐ A2, A3, C1 · ⬜
- Files: `apps/server/src/routes/export.ts` (new), hidden print route (new); `apps/server/package.json` add `puppeteer` (or `puppeteer-core`).
- `POST /api/export/pdf { docId }`: server launches headless Chromium, navigates to print-only render reusing `print.css` + `PageView`, calls `page.pdf({ printBackground, preferCSSPageSize: true })`. Bundle fixed font set.
- Boundary: server-only; **nothing in `packages/*` imports Puppeteer.**
- Accept: byte-identical PDF across machines given the same doc; page breaks match client print output.

**A5. PDF fidelity tests.** ⇐ A3 or A4 · ⬜
- Files: `e2e/export-pdf.spec.ts` (new).
- Playwright: build a multi-page doc with all node types, trigger export, assert page count and break positions match `layout-engine` `Page[]`.

### Group B — DOCX (schema map)

**B1. PM JSON node/block mapper.** ⇐ A1 · ⬜
- Files: `packages/export/src/docx/nodes.ts` (new).
- **Current HTML-based equivalent:** [`apps/demo/src/utils/export.ts:215-234,274-335`](../../apps/demo/src/utils/export.ts) — `elementToDocxParagraph()`, `htmlToDocxDocument()`.
- **Target:** Walk PM JSON directly. Map block nodes: `paragraph` (+ `textAlign` → `AlignmentType`), `heading` (level → `HeadingLevel`), `bulletList`/`orderedList`/`listItem` → docx numbering (native OOXML, not flat text), `blockquote` → indented paragraph, `codeBlock` → monospace shaded paragraph, `horizontalRule`, `pageBreak` → `PageBreak()`.
- Accept: unit test converts a fixture doc → a `docx.Document` whose paragraph/heading/list structure matches expected.

**B2. PM JSON mark/inline mapper.** ⇐ B1 · ⬜
- Files: `packages/export/src/docx/marks.ts` (new).
- **Current HTML-based equivalent:** [`apps/demo/src/utils/export.ts:182-213`](../../apps/demo/src/utils/export.ts) — `childrenToTextRuns()`.
- **Target:** Walk PM marks directly. Map: bold/italic/underline/strike/code, `textStyle` fontSize → half-points, `link` → `ExternalHyperlink`. Split text node marks into styled runs.
- Accept: unit test — paragraph with bold+italic+link produces correct run sequence.

**B3. Table + image mappers.** ⇐ B1, and ⇐ Phase 2 (`resolveImage`) · ⬜
- Files: `packages/export/src/docx/table.ts`, `packages/export/src/docx/image.ts` (new).
- **Current HTML-based table:** [`apps/demo/src/utils/export.ts:236-259`](../../apps/demo/src/utils/export.ts) — `tableToDocxTable()`.
- **Target:** PM JSON table nodes → docx `Table` with header shading, cell borders, column widths. Image: `resolveImage(src)` → `ImageRun` with EMU dimensions; fall back to placeholder on failure.
- Accept: a doc with a 3×3 table + embedded image opens correctly in Word/LibreOffice.

**B4. Footnote mapper + `exportDocx()` assembly.** ⇐ B1, B2, B3 · ⬜
- Files: `packages/export/src/docx/footnote.ts`, `packages/export/src/docx/index.ts` (new).
- Footnote: inline atom → docx `FootnoteReferenceRun` with note body from `attrs.content`. Forward-compatible with future `sourceId`.
- Assembly: `Document` with sections sized from `ctx.geometry`, `Packer.toBlob()` (browser) / `Packer.toBuffer()` (Node).
- Accept: `exportDocx(ctx)` returns valid `.docx`; footnote markers visible in Word.

**B5. DOCX fidelity tests.** ⇐ B4 · ⬜
- Files: `packages/export/src/__tests__/docx.test.ts` (new).
- Unit: serialize fixtures, unzip OOXML, assert key XML structures. Use headless `resolveImage` stub.
- Accept: all node/mark types covered; tests green in CI.

### Group C — UI + wiring

**C1. Export menu + emit types.** ✅ Done
- **Done:** [`HeaderBar.vue:40,98-108`](../../packages/vue/src/components/HeaderBar.vue) — emit type widened to all 8 formats. Menu items for all 8 formats. `DocsEditor.vue:60,715` forwards the event.
- **Remaining:** Replace bare `window.print()` at [`DocsEditor.vue:485`](../../packages/vue/src/components/DocsEditor.vue) with `exportPdf()` orchestration (A3). Add built-in default handler inside `DocsEditor` so it works without the host wiring `@export`.

**C2. Thread `onExport` + `resolveImage` props.** ⇐ A1, C1 · ⬜
- Files: [`DocsEditor.vue`](../../packages/vue/src/components/DocsEditor.vue) props, `packages/vue/src/composables/useEditor.ts`, `packages/vue/src/index.ts`.
- Add `onExport?` and `resolveImage?` to props. Default `resolveImage` = `fetch(src) → arrayBuffer`. When host provides `onExport`, delegate to it (e.g. route PDF to server); otherwise use client defaults.
- Accept: host can override PDF to go server-side via `onExport`; no override = client defaults work.

**C3. Extract `export.ts` from demo to library.** ⇐ A1, C1 · 🔄
- **Current:** [`apps/demo/src/utils/export.ts`](../../apps/demo/src/utils/export.ts) (406 lines) contains the full working export engine.
- **Target:** Move reusable core (types, `exportDocx`, `exportDocument` dispatcher, format utilities) to `packages/export/`. Keep demo-specific wiring (`EditorLike`, `filenameFromTitle`) in the demo. The demo app imports from `@kedata-indonesia/docflow-export`.

**C4. Apps/web wiring (server PDF).** ⇐ C2, A4 · ⬜
- Files: `apps/web` (does not exist yet). Listen to `@export`; pass `onExport` that routes `pdf` → `POST /api/export/pdf` (A4) and `docx` → client `exportDocx`.
- `apps/demo` stays client-only (backend-free showcase).

**C5. Docs + contract update.** ⇐ C1, C2 · ⬜
- Files: Library contract, this document.
- Document `onExport`, `resolveImage`, client-vs-server split per format, and that `packages/*` contains no backend/Puppeteer code.

### Group D — ODT & RTF enhancement (low priority)

**D1. Upgrade ODT to rich format.** ⬜
- Current: [`apps/demo/src/utils/export.ts:98-150`](../../apps/demo/src/utils/export.ts) — plain-text only.
- Target: Style text, table, and image mapping to ODF XML. Keep in `apps/demo/` for now.

**D2. Upgrade RTF to rich format.** ⬜
- Current: [`apps/demo/src/utils/export.ts:82-96`](../../apps/demo/src/utils/export.ts) — plain-text only.
- Target: Style text bold/italic/underline in RTF syntax. Keep in `apps/demo/` for now.

---

## 5. Sequencing

```
 ✅ C1 (menu + emit) — already done
        │
        ├──► A1 (scaffold packages/export) ──► C3 (extract export.ts from demo → library)
        │         │
        │         ├──► B1 (PM JSON blocks) ─► B2 (marks) ─┬─► B4 (footnote + assembly) ─► B5 (tests)
        │         │                                        │
        │         └──► B3 (table + image) ─────────────────┘   (B3 ⇐ Phase 2 resolveImage)
        │
        ├──► A2 (extract print.css + @page binding) ✅ Done (partially)
        │         │
        │         └──► A3 (exportPdf orchestration)
        │                   │
        │                   └──► A5 (PDF tests)
        │
        └──► A3 + B4 completed ──► C2 (onExport/resolveImage props)
                                            │
                                            └──► C4 (apps/web wiring + A4 Puppeteer)
                                                  └──► C5 (docs update)
```

**Priority order:**
1. **A1 + C3** — Extract working export engine into `packages/export/`. This unblocks everything.
2. **B1→B4** — PM JSON-based DOCX mapper with full node/mark/pageBreak/footnote support.
3. **A2→A3** — Proper PDF orchestration with geometry-aware print CSS. ✅ A2 partially done.
4. **C2** — `onExport`/`resolveImage` props for host customization.
5. **A4→C4** — Optional: server-side PDF, if needed for production.
6. **D1, D2** — ODT/RTF enhancements (lowest priority).

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Page-break fidelity: print output differs from on-screen pagination.** | Drive print with `@page`/`preferCSSPageSize` from `PAGE_SIZES` geometry (A2), force breaks on `pageBreak` node, settle `PageLayout.layout(immediate)` before printing (A3). A5 asserts page count vs `layout-engine` `Page[]`. Prefer the server Puppeteer path (A4) for reproducibility. |
| **HTML-based DOCX mapper loses PM semantics.** Current implementation can't map `pageBreak` or `footnote` because those nodes render as opaque divs/spans in HTML. | The PM JSON-based mapper (B1–B4) is the correct path. Keep the HTML mapper working in the demo until B4 lands, then swap. |
| **Footnotes don't print / export correctly.** Current footnote renders as a plain `'1'` atom with `data-footnote-content` attribute. | HTML export preserves the attribute (could be processed downstream). PM JSON-based DOCX mapper (B4) maps footnotes to OOXML natively. Print CSS can show footnote content via `::after` pseudo-element reading the attribute. |
| **Tables: complex layouts map imperfectly to OOXML.** | Read `colwidth` attrs from resizable table; map header shading + borders (B3). Parsed-assert core structure in B5. |
| **Images from Phase 4 storage: bytes unreachable / CORS / auth.** | `resolveImage` is host-injected (C2) so app fetches with own auth. On failure, insert placeholder — never throw the whole export (B3). |
| **Puppeteer bloats the on-prem image.** | Server PDF is **optional** — client print-CSS PDF is zero-dependency default. Use `puppeteer-core` + system Chromium (Phase 8). |
| **Boundary erosion.** PR adds Puppeteer or fetch-auth into `packages/*`. | Keep server rendering in `apps/server`; library exposes only hooks (C2). |
| **Unused `html2pdf.js` dependency.** | Removed 2026-07-19 after the `.page` spacer issue was identified. Do not reintroduce unless the pagination DOM changes. |

---

## 7. Out of Scope (this phase)

- **Cited export** (citations + bibliography in PDF/DOCX) — Phase 6D; footnote mapper is forward-compatible.
- **Import** (DOCX/PDF → editor) — export only.
- **PDF/A, digital signatures, password protection, accessibility tagging.**
- **Headers/footers/page numbers in exports** beyond what the current schema and geometry provide (Phase 9).
- **Batch/scheduled export and export-to-storage** — app may add this atop the hooks later.
- **Changesets workflow** for package publishing — see `docs/PUBLISH.md`.
</content>
</invoke>
