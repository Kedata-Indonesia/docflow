# Phase 5 — Export (PDF / DOCX) · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 5 · **Priority:** P1 · **Depends on:** Phase 2 · **Last updated:** 2026-07-17

> **Goal:** Google-Docs-grade export. **PDF** reuses the existing pagination model
> (`layout-engine`) so page breaks in the file match what the user sees on screen.
> **DOCX** maps the ProseMirror/TipTap schema to Office Open XML (headings, lists,
> tables, images, alignment). Both are exposed as **library export hooks** and wired to an
> `apps/web` "Download as…" action. The library never imports backend concerns; ProseMirror
> state remains the single source of truth.

---

## 1. Current State (what exists today)

Export is a **UI stub with no implementation**: a menu emits an event that no one handles.

| Where | What it does | File |
|-------|--------------|------|
| File → Unduh menu | Menu items `export:markdown` / `export:html` / `export:txt`; "Cetak…" → `print` | [HeaderBar.vue:90-96](../../packages/vue/src/components/HeaderBar.vue) |
| HeaderBar action dispatch | `action.startsWith('export:')` → `handleExport(format)` → `emit('export', format)` | [HeaderBar.vue:65-66,181-183](../../packages/vue/src/components/HeaderBar.vue) |
| HeaderBar emit type | `export: [format: 'markdown' \| 'html' \| 'txt']` — no PDF/DOCX in the type | [HeaderBar.vue:35](../../packages/vue/src/components/HeaderBar.vue) |
| DocsEditor forward | Re-declares the emit ([DocsEditor.vue:54](../../packages/vue/src/components/DocsEditor.vue)) and forwards `@export="$emit('export', $event)"` up to the host | [DocsEditor.vue:662](../../packages/vue/src/components/DocsEditor.vue) |
| Host consumer | **None.** No `apps/demo` or `apps/web` component listens for `@export` — the event dies at the top | (grep: only the forward at DocsEditor.vue:662) |
| Print | `handlePrint = () => window.print()` (raw, no print CSS geometry) | [DocsEditor.vue:432](../../packages/vue/src/components/DocsEditor.vue), [EditorView.vue:222-223](../../apps/demo/src/components/EditorView.vue) |

**Net state:** there is **no PDF, no DOCX, and not even a working markdown/html/txt exporter** — only an event bus stub and a bare `window.print()`. Phase 5 builds the real thing.

**Key existing assets we build on:**

- **Pagination model (the crown jewel for PDF).** `PageLayout` measures rendered block DOM (`getBoundingClientRect`, `getComputedStyle`, shadow-DOM measuring pass, `ResizeObserver`) and `PageBreaker.computePages()` returns `Page[]` where each `Page = { from, to, blocks: BlockInfo[] }` ([PageBreaker.ts:13-159](../../packages/layout-engine/src/PageBreaker.ts), [types.ts:1-46](../../packages/layout-engine/src/types.ts)). Breaks account for CSS margins, force-breaks (`pageBreak` node / `data-page-break`), oversized-block isolation, and mid-paragraph splitting via binary search ([PageLayout.ts:80-105](../../packages/layout-engine/src/PageLayout.ts), [PageBreaker.ts:161-207](../../packages/layout-engine/src/PageBreaker.ts)). **This is DOM-measurement based — it only runs in a browser.**
- **Page geometry.** `PAGE_SIZES` (A4/F4/Letter/Legal/A5, in px @96dpi) live in [layout-engine/types.ts:55-61](../../packages/layout-engine/src/types.ts) and are also re-exported from core via `tiptap-pagination-plus` ([core/index.ts:4](../../packages/core/src/index.ts)); the Vue layer resolves the active size in [DocsEditor.vue:66](../../packages/vue/src/components/DocsEditor.vue).
- **Serialization entry points.** `DocsEditor.getJSON()` / `getHTML()` ([Editor.ts:134-135](../../packages/core/src/Editor.ts)) expose the PM doc — the input to the DOCX mapper.
- **The node/mark set to map** (`defaultPlugins`, [plugins/index.ts:29-43](../../packages/plugins/src/index.ts)): StarterKit marks (bold/italic/strike/code) + `formatting`, `headings`, `lists`, `alignment` (`TextAlign` on heading+paragraph, [alignment.ts:11-12](../../packages/plugins/src/alignment.ts)), `link`, `image` (`@tiptap/extension-image`, `src` attr, [image.ts:1-25](../../packages/plugins/src/image.ts)), `table` (Table/Row/Cell/Header, resizable, [table.ts:7-20](../../packages/plugins/src/table.ts)), `blockquote`, `codeBlock`, `pageBreak` (node name `pageBreak`, [pageBreak.ts:6](../../packages/plugins/src/pageBreak.ts)), and `footnote` (inline atom, `attrs.content` is a **plain string**, renders `data-node-type="footnote"` + `'1'` on HTML export, [footnote.ts:5-64](../../packages/plugins/src/footnote.ts)).
- **PageView** already renders per-page DOM from `Page[]` ([PageView.vue](../../packages/vue/src/components/PageView.vue)) — the surface a print-CSS PDF path targets.

**Boundary note (Phase 2 dependency):** DOCX must embed images and PDF must render them. After Phase 2/4 image srcs are self-hosted URLs supplied via `onImageUpload`; the export code must **fetch bytes by URL**, not assume any storage backend.

---

## 2. Target Architecture

Two independent pipelines from one source of truth. **PDF follows the on-screen page model; DOCX is a schema map that lets Word repaginate.**

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

**Design decisions:**

1. **PDF = browser rendering, not hand-drawn.** The pagination fidelity we need already lives
   in `layout-engine` + the DOM. Re-implementing it in a PDF drawing lib (pdf-lib/pdfmake)
   would fork the break logic and lose it. So PDF is produced by **rendering the paginated DOM
   and letting a browser paginate to paper** via print CSS.
   - **Client default:** a dedicated print stylesheet keyed to the active `PAGE_SIZES` entry +
     `window.print()` → user picks "Save as PDF". Zero dependencies, zero backend, respects the
     library boundary. This replaces the bare `window.print()` at [DocsEditor.vue:432](../../packages/vue/src/components/DocsEditor.vue).
   - **Server optional (apps/web only):** Puppeteer drives headless Chromium over a hidden
     `/print/:docId` route to emit **deterministic** PDF bytes (fixed fonts, no user "Save as"
     dialog, batch/automation, correct output on locked-down browsers). Server-only, so it lives
     in `apps/server` and **never** in `packages/*`.
2. **DOCX = schema map, headless, client-first.** DOCX has no fixed pages (Word repaginates), so
   it needs **no** `layout-engine`. It is a pure `PM JSON → OOXML` transform built with the
   [`docx`](https://www.npmjs.com/package/docx) library — runs identically in browser or Node.
   Default to **client-side** (no server round-trip, no backend dep); the same mapper can run in
   `apps/server` if a customer wants server-side generation.
3. **The library owns the hooks; the app owns the wiring.** A new headless package
   `packages/export` exports the DOCX serializer + shared types + the PDF *orchestration* helper.
   The browser-only print-CSS PDF path lives in the Vue layer (it needs the rendered DOM). The
   app supplies the "Download as…" UI, filenames, and the optional Puppeteer endpoint.
4. **`pageBreak` and `footnote` are first-class in both formats.** PDF honors force-breaks
   (already in `PageBreaker`); DOCX maps `pageBreak` → an OOXML page break and `footnote` →
   a real Word footnote (its `attrs.content` string becomes the note body). Phase 6 later
   upgrades footnote content from string to `sourceId`; the mapper is written to tolerate both.

---

## 3. Export-Hook Interface

New headless package **`packages/export`** (`@kedata-indonesia/docflow-export`), built with `tsup` like other leaf packages, depending only on `docx` + the schema types — **no** Vue, **no** backend.

```ts
// packages/export/src/types.ts
export type ExportFormat = 'pdf' | 'docx'

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

/** DOCX: pure JSON → OOXML. Runs in browser or Node. */
export function exportDocx(ctx: ExportContext): Promise<ExportResult>

/** DOCX node/mark mapper, exported for testing + reuse. */
export interface PMDocxSerializer {
  serialize(doc: object, ctx: ExportContext): Promise<import('docx').Document>
}
export function createDocxSerializer(): PMDocxSerializer
```

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

Grouped **A (PDF)** / **B (DOCX)** / **C (UI + wiring)**. Each task lists files, work, acceptance. Dependencies noted as `⇐`.

### Group A — PDF (page-accurate, browser-rendered)

**A1. Scaffold `packages/export` + shared types.** ⇐ none
- Files: `packages/export/{package.json,tsup.config.ts,tsconfig.json}` (new), `packages/export/src/types.ts` (new, §3 types), `packages/export/src/index.ts` (new). Add to `pnpm-workspace.yaml` if globs don't already cover it.
- `dependencies`: `docx`; devDeps mirror other leaf packages. **No** Vue/server deps.
- Accept: `pnpm --filter @kedata-indonesia/docflow-export build` + `typecheck` pass; importing `PageGeometry`/`ExportContext` resolves.

**A2. Print stylesheet keyed to page geometry.** ⇐ none
- Files: `packages/vue/src/export/print.css` (new); import path from `packages/vue/src/styles/`.
- Implement `@page { size: <w> <h>; margin: <t> <r> <b> <l>; }` generated from the active `PAGE_SIZES` entry (px→mm/pt conversion, @96dpi); `@media print` rules that (a) hide chrome (toolbar, rulers, sidebars, page gaps/shadows), (b) show only the page content, (c) force `break-before: page` on the `pageBreak` node and page boundaries, (d) `break-inside: avoid` for tables/images. Convert px `PAGE_SIZES` values to physical units so Chrome's paper size matches (A4 = 210×297mm).
- Accept: printing a 3-page doc to "Save as PDF" produces exactly 3 pages with margins matching the editor; a `pageBreak` node lands on a fresh page.

**A3. `exportPdf()` client orchestration (replace bare `window.print`).** ⇐ A2
- Files: `packages/vue/src/export/pdf.ts` (new); wire into [DocsEditor.vue:432](../../packages/vue/src/components/DocsEditor.vue).
- Client path: ensure the layout is settled (await `PageLayout.layout(immediate)` so `Page[]` is current), toggle a `printing` body class that activates `print.css`, call `window.print()`, restore on `afterprint`. Use the already-rendered `PageView` DOM ([PageView.vue](../../packages/vue/src/components/PageView.vue)) as the print surface — do **not** re-measure into a new lib.
- Accept: "Cetak…"/PDF export renders page-accurate output; force-breaks and mid-paragraph splits match on-screen pagination; no editor chrome in the PDF.

**A4. Server-side deterministic PDF via Puppeteer (apps/web / apps/server).** ⇐ A2, A3, C1
- Files: `apps/server/src/routes/export.ts` (new), hidden print route `apps/web/.../print/[docId]` (new); `apps/server/package.json` add `puppeteer` (or `puppeteer-core` + system Chromium for on-prem image size).
- `POST /api/export/pdf { docId }` (auth + doc-access checked, mirroring collab room access, [CLAUDE.md](../../CLAUDE.md) room-id note): server launches headless Chromium, navigates to a print-only render of the doc that reuses `print.css` + `PageView`, calls `page.pdf({ printBackground, preferCSSPageSize: true })`, streams bytes back. Bundle a fixed font set for reproducibility (see Risks).
- Boundary: this is server-only; the library exposes `onExport` so `apps/web` routes PDF here instead of `window.print()`. **Nothing in `packages/*` imports Puppeteer.**
- Accept: `POST /api/export/pdf` returns a byte-identical PDF across machines given the same doc; page breaks match the client print output.

**A5. PDF fidelity tests.** ⇐ A3 (, A4)
- Files: `e2e/export-pdf.spec.ts` (new).
- Playwright: build a multi-page doc exercising each node (heading, list, table, image, blockquote, codeBlock, footnote, explicit `pageBreak`), trigger export, assert page count and that a forced break starts a new page (use Playwright `page.pdf()` in headless as the deterministic oracle; count pages via a PDF parse helper).
- Accept: page count and break positions match the layout-engine `Page[]` for the same doc.

### Group B — DOCX (schema map)

**B1. Node/block mapper (PM JSON → docx blocks).** ⇐ A1
- Files: `packages/export/src/docx/nodes.ts` (new).
- Map block nodes: `paragraph` (+ `textAlign` → `AlignmentType`, from [alignment.ts](../../packages/plugins/src/alignment.ts)), `heading` (level → `HeadingLevel`), `bulletList`/`orderedList`/`listItem` → docx numbering/bullets (define a numbering config with nesting levels), `blockquote` → indented/styled paragraph, `codeBlock` → monospace shaded paragraph (preserve newlines), `horizontalRule`, and `pageBreak` → `new Paragraph({ children:[new PageBreak()] })`.
- Accept: unit test converts a fixture doc → a `docx.Document` whose paragraph/heading/list structure matches expected (Group parse-assert in B5).

**B2. Mark/inline mapper (PM marks → docx runs).** ⇐ B1
- Files: `packages/export/src/docx/marks.ts` (new).
- Map marks to `TextRun` props: bold/italic/underline/strike/code, `textStyle` fontSize (from [fontSize.ts](../../packages/plugins/src/fontSize.ts)) → half-points, `link` → `ExternalHyperlink`. Split a text node's marks into styled runs.
- Accept: unit test — a paragraph with bold+italic+link produces the right run sequence with styles.

**B3. Table + image mappers.** ⇐ B1, and ⇐ Phase 2 (`resolveImage`)
- Files: `packages/export/src/docx/table.ts`, `packages/export/src/docx/image.ts` (new).
- Table: `table`/`tableRow`/`tableCell`/`tableHeader` ([table.ts](../../packages/plugins/src/table.ts)) → docx `Table`/`TableRow`/`TableCell`; map header row shading, cell borders, and column widths (from `colwidth` attrs when present, else even split).
- Image: `image` node `src` → `resolveImage(src)` → `ImageRun`. Compute EMU dimensions from intrinsic size or node attrs; fall back to a placeholder + warning if `resolveImage` is absent or fetch fails (never throw the whole export).
- Accept: a doc with a 3×3 table (header row) + one image round-trips to a `.docx` that opens in Word/LibreOffice with the table and embedded image intact.

**B4. Footnote mapper + `exportDocx()` assembly.** ⇐ B1, B2, B3
- Files: `packages/export/src/docx/footnote.ts`, `packages/export/src/docx/index.ts` (new); export `exportDocx`/`createDocxSerializer` from `packages/export/src/index.ts`.
- Footnote ([footnote.ts](../../packages/plugins/src/footnote.ts)): inline atom → docx `FootnoteReferenceRun`; register the note body from `attrs.content` (plain string today). Write the mapper to accept a future `sourceId` (Phase 6) without breaking. Assemble `Document` with `sections` sized from `ctx.geometry` (page size + margins), `title` as metadata, then `Packer.toBlob()` (browser) / `Packer.toBuffer()` (Node).
- Accept: `exportDocx(ctx)` returns a valid `.docx`; footnote markers and note text appear correctly in Word.

**B5. DOCX fidelity tests.** ⇐ B4
- Files: `packages/export/src/__tests__/docx.test.ts` (new).
- Unit: serialize fixtures for each node/mark; unzip the OOXML (docx is a zip) and assert key XML (`w:p`, `w:tbl`, `w:drawing`, `w:footnoteReference`, numbering, alignment). Use a headless `resolveImage` stub returning fixed bytes.
- Accept: all node/mark types covered; tests green in CI.

### Group C — UI + wiring

**C1. Widen the export event + built-in default handler.** ⇐ A3, B4
- Files: [HeaderBar.vue:35,90-96](../../packages/vue/src/components/HeaderBar.vue), [DocsEditor.vue:54,662](../../packages/vue/src/components/DocsEditor.vue).
- Add `PDF (.pdf)` and `Word (.docx)` to the "Unduh" submenu; widen the emit type to `'markdown' | 'html' | 'txt' | 'pdf' | 'docx'`. In `DocsEditor`, add a built-in handler: for `docx` build `ExportContext` from `getJSON()` + active geometry ([DocsEditor.vue:66](../../packages/vue/src/components/DocsEditor.vue)) and call `exportDocx()` then trigger a download; for `pdf` call `exportPdf()` (client print). If the host passed `onExport`, delegate to it instead.
- Accept: File → Unduh → Word downloads a `.docx`; → PDF prints/saves; existing md/html/txt still emit for host handling.

**C2. Thread `onExport` + `resolveImage` props through the library.** ⇐ A1, C1
- Files: `packages/vue/src/components/DocsEditor.vue` props, `packages/vue/src/composables/useEditor.ts`, `packages/vue/src/index.ts` (export `ExportFormat`/`ExportContext` types), `packages/element/*` if the Web Component surfaces it.
- Add `onExport?` and `resolveImage?` to props/contract (extends the Phase 0 `LIBRARY_CONTRACT.md` injection points). Default `resolveImage` = `fetch(src) → arrayBuffer` (works for self-hosted URLs from Phase 2/4).
- Accept: a host can override PDF to go server-side purely via `onExport`; with no override the client defaults work.

**C3. `apps/web` "Download as…" wiring (incl. server PDF).** ⇐ C2, A4
- Files: `apps/web` editor view (Phase 3 product) — listen to `@export`; pass `onExport` that routes `pdf` → `POST /api/export/pdf` (A4) and `docx` → client `exportDocx` (or server if configured); trigger file download from the returned blob/stream. Also update `apps/demo` to keep client-only defaults (backend-free showcase).
- Accept: in `apps/web`, "Download as PDF" yields a server-rendered deterministic PDF and "Download as Word" yields a `.docx`; in `apps/demo`, both work client-side with no backend.

**C4. Docs + contract update.** ⇐ C1, C2
- Files: [docs/LIBRARY_CONTRACT.md](../LIBRARY_CONTRACT.md) (Phase 0), [CLAUDE.md](../../CLAUDE.md).
- Document the export hooks (`onExport`, `resolveImage`), the client-vs-server split per format, and that `packages/*` contains no backend/Puppeteer code.
- Accept: contract lists the export injection points with types; matches the shipped API.

---

## 5. Sequencing

```
A1 ─┬─► A2 ─► A3 ─► A5
    │              └───────────► A4 ─┐   (A4 also ⇐ C1)
    │                                │
    └─► B1 ─┬─► B2 ─┐               │
            ├─► B3 ─┤               │
            └───────┴─► B4 ─► B5    │
                         │          │
A3, B4 ─────────────────┴─► C1 ─► C2 ─► C3
                                    └─► C4
Phase 2 (resolveImage / self-hosted image URLs) ─► B3, C2
```

Land **A1→A2→A3 (client print-CSS PDF)** and **B1→B4 (client DOCX)** first — those two prove
page-accurate PDF and structural DOCX with zero backend, satisfying the phase acceptance. Then
**C1/C2** wire the UI, **A4/C3** add the optional server-side deterministic PDF for `apps/web`,
and **C4** updates the contract. Do not start B3 image embedding until Phase 2's `resolveImage`
injection exists.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Page-break fidelity: print output differs from on-screen pagination.** Browser print pagination is not the same engine as `layout-engine`. | Drive print with `@page`/`preferCSSPageSize` sized from the same `PAGE_SIZES` geometry (A2), force breaks on the `pageBreak` node and `break-inside: avoid` for atomic blocks, and settle `PageLayout.layout(immediate)` before printing (A3). A5 asserts page count/break positions vs the layout-engine `Page[]`. Prefer the **server Puppeteer path (A4)** when byte-exact reproducibility matters. |
| **Fonts: substitution changes wrapping → wrong breaks; client machine lacks a font.** | Client path inherits the user's rendered fonts (WYSIWYG). Server path **bundles a fixed font set** in the Chromium image and disables remote fonts, so output is deterministic and self-hostable (no external CDN, per on-prem rules). |
| **Tables: complex layouts (merged cells, column widths, resizable) map imperfectly to OOXML.** | Read `colwidth` attrs from the resizable table ([table.ts](../../packages/plugins/src/table.ts)) into docx column widths; map header shading + borders explicitly (B3). Document merged-cell edge cases as best-effort; parse-assert core structure in B5. |
| **Images from Phase 4 storage: bytes unreachable / CORS / auth on fetch.** | `resolveImage` is host-injected (C2) so the app fetches with its own auth/session; DOCX embeds returned bytes, PDF renders from URL. On fetch failure, insert a placeholder + log — **never throw the whole export** (B3). Requires Phase 2. |
| **Footnote is a plain string today; Phase 6 changes it to `sourceId`.** | Mapper reads `attrs.content` now but is written to also accept `sourceId` (B4), so Phase 6D cited export slots in without a rewrite. |
| **Puppeteer bloats the on-prem image / needs Chromium.** | Server PDF is **optional** — client print-CSS PDF is the zero-dependency default. Use `puppeteer-core` + a system Chromium in the Docker image (Phase 8) to control size; document as an opt-in deployment feature. |
| **Boundary erosion.** A PR that adds Puppeteer or fetch-auth into `packages/*`. | Keep server rendering in `apps/server`; library exposes only `onExport`/`resolveImage` hooks (C2, C4). Enforce with the Phase 0 lint guard. |

## 7. Out of Scope (this phase)

- **Cited export** (citations + bibliography rendering correctly in PDF/DOCX) — Phase 6D; footnote mapper is only made forward-compatible here.
- **Markdown/HTML/TXT exporters** — the existing `export:*` events remain host-handled; not implemented in Phase 5.
- **Import** (DOCX/PDF → editor) — export only.
- **PDF/A, digital signatures, password protection, accessibility tagging.**
- **Headers/footers/page numbers in exports** beyond what the current schema and geometry provide (revisit with Phase 9 headers/footers).
- **Batch/scheduled export and export-to-storage** — the app may add this atop the hooks later.
</content>
</invoke>
