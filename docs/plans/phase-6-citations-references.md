# Phase 6 — Citations & References (Chicago / CSL) · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 6 · **Priority:** P1 (headline feature) · **Last updated:** 2026-07-17

> **Goal:** academic-grade citations and a bibliography with real style support, driven by
> **structured source data — never formatted strings**. A citation node stores
> `{ sourceId, locator }`; **citeproc-js** derives every in-text citation, footnote, and the
> bibliography from source metadata (**CSL-JSON**) + the active **CSL** style. Changing the
> style or editing a source **re-renders everything** — the same "single source of truth,
> derived view" pattern already used for pagination and collab.

---

## 1. Current State (what we're building on / replacing)

There is **no citation or reference infrastructure today**. The only adjacent feature is the
footnote node, and it stores rendered text, not a source reference.

| Where | What it does | File |
|-------|--------------|------|
| Footnote node | Inline `atom`; stores `content` as a **plain string** attr (`data-footnote-content`); `renderHTML` emits a `1` placeholder; `addNodeView` shows `1` and syncs the string | [packages/plugins/src/footnote.ts:5-64](../../packages/plugins/src/footnote.ts) |
| Footnote plugin | `footnotePlugin` = `insertFootnote` command (`insertContent({ type:'footnote', attrs:{ content }})`), toolbar + slash entries | [packages/plugins/src/footnote.ts:66-83](../../packages/plugins/src/footnote.ts) |
| Footnote numbering / rendering | `updateFootnotes()` walks `.docs-footnote-ref` DOM, **DOM-numbers** refs `1..n`, and builds per-page contenteditable footnote areas that sync the string back to PM **on blur** | [packages/vue/src/components/DocsEditor.vue:400-620](../../packages/vue/src/components/DocsEditor.vue) |
| Insert path | Toolbar `insert-footnote` → PM `tr.insert` of a `footnote` node, then `updateFootnotes()` | [DocsEditor.vue:400-420](../../packages/vue/src/components/DocsEditor.vue), [HeaderBar.vue:129](../../packages/vue/src/components/HeaderBar.vue) |
| Sidebars present | `AISidebar`, `CommentsSidebar`, `HistorySidebar`, `TOCSidebar` — **no references/sources sidebar** | [packages/vue/src/components/sidebars/](../../packages/vue/src/components/sidebars/) |
| Server routes present | `documents`, `collab`, `users`, `auth` — **no sources/reference-library route** | [apps/server/src/routes/](../../apps/server/src/routes/) |
| Document model | `content` (TipTap JSON), `plainText`, `owner`, `collaborators[]`, `starred`, `folderId` — **no embedded source snapshot** | [apps/server/src/models/Document.ts:3-33](../../apps/server/src/models/Document.ts) |

**Consequences we design around:**
- The footnote today is a **string container**; Chicago notes-bibliography needs footnotes that
  can *optionally* be a citation (hold a `sourceId`) so they reformat with the style. The existing
  free-text footnote must keep working (backward-compatible attr).
- Footnote **numbering is DOM-driven** (`updateFootnotes()`), not schema-driven — the citation
  engine must not fight it; citation-backed footnotes plug into the same numbering pass.
- Custom-node attrs travel through Yjs (`yXmlFragmentToProsemirrorJSON`) — new citation/bibliography
  nodes and the extended footnote attr must round-trip through the Phase 1 persistence path.

**Key existing hooks we build on:**
- `definePlugin` / `DocsEditorPlugin` contract (`tiptapExtensions`, `toolbar`, `slashCommands`,
  `commands`, `hooks.onInit/onDestroy`) — [PluginSystem.ts:18-32](../../packages/core/src/PluginSystem.ts).
- `createEditor` rebuilds the whole editor on `.use(plugin)` and preserves JSON+selection
  ([Editor.ts:101-127](../../packages/core/src/Editor.ts)); a new node view can re-render on a
  document-level signal without a schema change.
- `defaultPlugins` array is the single registration point for built-ins — [plugins/src/index.ts:29-43](../../packages/plugins/src/index.ts).
- Document CRUD pattern (auth-guarded Express routers, `extractPlainText`) — [documents.ts](../../apps/server/src/routes/documents.ts).

---

## 2. Target Architecture

```
  APP (apps/server + apps/web)                 LIBRARY (packages/plugins + engine wrapper)
 ┌──────────────────────────────┐            ┌──────────────────────────────────────────────┐
 │  Reference library           │            │  citationPlugin                                │
 │  Source { CSL-JSON } (Mongo) │            │   ├─ citation node   {sourceId, locator}       │
 │   ├─ CRUD / search / share   │  insert    │   ├─ footnote node   {content, sourceId?}      │
 │   ├─ importers ──────────────┼──citation──▶│   └─ bibliography node {} (auto-rendered)      │
 │   │   manual · DOI/CrossRef  │  (by id)   │              │                                 │
 │   │   BibTeX/RIS · [Zotero†] │            │              ▼                                  │
 │   └─ reference-manager UI    │            │   CiteEngine (citeproc-js wrapper)             │
 └───────────┬──────────────────┘            │     inputs:  CSL-JSON sources + active CSL     │
             │ embed snapshot on save         │     outputs: in-text cites + footnotes + bib   │
             ▼                                │              │                                 │
   Document.sources[]  ── CSL-JSON snapshot ──┼──────────────┘                                 │
   (standalone / offline render)             │   CSL styles bundled: Chicago notes-bib,       │
                                             │     Chicago author-date, APA, MLA (.csl + locale)│
                                             └──────────────────────────────────────────────┘

  DERIVED-VIEW LOOP (single source of truth = PM state + source metadata):
     edit source  ─┐
     switch style ─┼─▶  CiteEngine.rebuild()  ─▶  re-render all citation/footnote node views
     add citation ─┘                              + regenerate bibliography node
```

**Design decisions:**

1. **Nodes store references, never text.** `citation` = `{ sourceId, locator, mode }`;
   `bibliography` = `{}` (fully derived). The extended `footnote` keeps `content` (free text,
   backward-compatible) **and** gains an optional `sourceId` + `locator`. When `sourceId` is set,
   the footnote's text is *rendered by citeproc*, not typed.
2. **One engine instance per editor, document-scoped.** A `CiteEngine` wraps `citeproc-js`, is
   created in `citationPlugin.hooks.onInit`, holds the CSL-JSON source map + active style, and
   exposes `renderCluster(citationId)`, `renderBibliography()`, `setStyle(id)`, `updateSources()`.
   Node views subscribe to it and repaint on change (no schema rebuild needed).
3. **Sources reach the engine via injection, not import.** The library never fetches from the
   backend. The host app supplies sources through an injectable `citationSources` provider
   (array/getter of CSL-JSON) + `onCitationInsert`/`onSourceRequest` callbacks — mirroring the
   Phase 2 `onImageUpload` injection pattern. The reference library, CRUD, and importers live
   **entirely app-side**.
4. **Style = a CSL file.** "Chicago" is `chicago-note-bibliography.csl` or
   `chicago-author-date.csl`; APA/MLA/IEEE are the same mechanism. Styles + `locales-en-US.xml`
   are bundled as static assets in the engine wrapper; switching style calls `setStyle()` and
   re-renders live. ~2,600 CSL styles are then available for free.
5. **Docs carry an embedded source snapshot.** On save, the app writes the CSL-JSON of every cited
   source into `Document.sources[]`. On load, the editor is initialized from that snapshot so a
   document renders **standalone/offline**, even if a source was later deleted from the library.
   The live library is authoritative for *editing*; the snapshot is authoritative for *rendering*.
6. **Footnote numbering stays DOM-driven.** Citation-backed footnotes emit the same
   `.docs-footnote-ref` markers so the existing `updateFootnotes()` numbering pass is reused; only
   the *body text* of a citation footnote is produced by citeproc.
7. **Collab-safe.** New node attrs are plain JSON and round-trip through the Phase 1
   Yjs→PM-JSON derivation. The rendered strings are **never** stored in PM state — so two clients
   with the same sources + style converge to identical output; a style change re-renders locally
   from shared attrs without a divergent write.

---

## 3. Data Model

### 3.1 `Source` — app-side reference library (CSL-JSON) — `apps/server/src/models/Source.ts` (new)

```ts
// A source record IS a CSL-JSON item plus library/ownership metadata.
// CSL-JSON is the interchange format citeproc-js consumes directly.
interface ICslName { family?: string; given?: string; literal?: string }
interface ICslDate { 'date-parts'?: number[][]; raw?: string; literal?: string }

interface ICslData {                     // the CSL-JSON payload (subset; passthrough the rest)
  id: string                             // stable id, == Source._id string; used by citation nodes
  type: string                           // 'book' | 'article-journal' | 'webpage' | 'chapter' | ...
  title?: string
  author?: ICslName[]
  editor?: ICslName[]
  issued?: ICslDate
  'container-title'?: string
  publisher?: string
  'publisher-place'?: string
  page?: string
  volume?: string; issue?: string
  DOI?: string; URL?: string; ISBN?: string
  abstract?: string
  [k: string]: unknown                   // preserve any other CSL fields verbatim
}

interface ISource {
  csl: ICslData                          // authoritative structured metadata
  owner: string                          // better-auth user id
  sharedWith: string[]                   // user ids (library sharing)
  tags: string[]
  source: 'manual' | 'crossref' | 'bibtex' | 'ris' | 'zotero'
  createdAt: Date
  updatedAt: Date
}
// indexes: { owner: 1 }, text index on csl.title + csl.author family for search,
//          unique compound { owner: 1, 'csl.DOI': 1 } (sparse) to dedupe DOI imports
```

### 3.2 `citation` inline node — `packages/plugins/src/citation.ts` (new)

```ts
// inline, atom, selectable — like footnote; renders derived text via node view, stores none.
addAttributes() {
  return {
    sourceId: { default: null,   /* Source id / CSL id */ },
    locator:  { default: '',     /* e.g. "pp. 12–14"; page/chapter pin-cite */ },
    label:    { default: 'page', /* citeproc locator label: page|chapter|section|... */ },
    mode:     { default: 'normal', /* 'normal' | 'author-only' | 'suppress-author' */ },
    prefix:   { default: '' },
    suffix:   { default: '' },
    // NO rendered-text attr. The node view asks CiteEngine for the string.
  }
}
// parseHTML: span[data-node-type="citation"]; renderHTML: placeholder span (copy/paste/export)
// addNodeView: renders CiteEngine.renderCluster(node) output; subscribes to engine 'change'
```

### 3.3 Extended `footnote` node — `packages/plugins/src/footnote.ts` (modify)

```ts
addAttributes() {
  return {
    content:  { default: '', /* EXISTING — free-text footnote, unchanged */ },
    sourceId: { default: null, /* NEW — when set, body text is citeproc-rendered */ },
    locator:  { default: '' },  // NEW
    label:    { default: 'page' }, // NEW
  }
}
// When sourceId != null: node view / updateFootnotes() shows CiteEngine.renderFootnote(node)
// instead of `content`. When sourceId == null: behaves exactly as today (backward compatible).
```

### 3.4 `bibliography` node — `packages/plugins/src/bibliography.ts` (new)

```ts
// block, atom (no editable children); one per document, conventionally at the end.
addAttributes() { return {} }  // fully derived; no stored entries
// addNodeView: renders CiteEngine.renderBibliography() (ordered/formatted list),
//   re-renders on engine 'change' (source edit, style switch, citation add/remove).
// Empty state: renders nothing / a placeholder when the document has no citations.
```

### 3.5 `Document.sources[]` — embedded snapshot — `apps/server/src/models/Document.ts` (modify)

```ts
interface IDocument {
  // ...existing fields...
  sources: ICslData[]   // NEW — CSL-JSON snapshot of every source cited in this doc
  cslStyle: string      // NEW — active style id, e.g. 'chicago-note-bibliography' (default)
}
```

### 3.6 Library injection contract — `packages/core` (extend `EditorOptions` / plugin options)

```ts
interface CitationOptions {
  sources: ICslData[] | (() => ICslData[])   // CSL-JSON provider (from app snapshot or live lib)
  style: string                              // active CSL style id
  onSourceRequest?: () => Promise<string | null> // app opens picker → returns chosen sourceId
  onSourcesChange?: (ids: string[]) => void  // app updates Document.sources snapshot
}
```

---

## 4. Task Breakdown

Grouped by roadmap stage. Each task lists **layer**, files, work, acceptance. Dependencies `⇐`.

### Stage 6A — Citation engine · **LIBRARY** (`packages/plugins` + engine wrapper) · *can start after Phase 2*

**6A-1. Add citeproc-js + CSL assets.** ⇐ none · *Library*
- Files: [packages/plugins/package.json](../../packages/plugins/package.json); new `packages/plugins/src/csl/` (bundled `.csl` + `locales-en-US.xml`).
- Add `citeproc` (citeproc-js) as a dependency; declare it a peer/optional dep if bundle-splitting is desired. Vendor 4 CSL styles: `chicago-note-bibliography.csl`, `chicago-author-date.csl`, `apa.csl`, `modern-language-association.csl`, plus the en-US locale.
- Accept: `import CSL from 'citeproc'` resolves in the plugins build; CSL/locale files load as strings via the engine wrapper.

**6A-2. `CiteEngine` wrapper.** ⇐ 6A-1 · *Library*
- File: `packages/plugins/src/citeEngine.ts` (new).
- Wrap `citeproc-js`: constructor takes `{ sources: ICslData[], style, locale }`; builds a `CSL.Engine` with a `sys` object (`retrieveItem(id)`, `retrieveLocale(lang)`). Expose:
  - `renderCluster(attrs) → string` (in-text citation) and `renderFootnote(attrs) → string`.
  - `renderBibliography() → { items: string[]; ... }`.
  - `setStyle(id)`, `updateSources(sources)`, `addCitation(id, attrs)`, `removeCitation(id)`.
  - An emitter (`on('change', cb)`) so node views repaint; recompute citation clusters in document order for correct ibid./short-form handling (Chicago notes-bib).
- Accept: unit test — feed 2 CSL-JSON items + Chicago notes-bib style → assert expected footnote string and bibliography entries; switch to APA → strings change (Group 6-Tests).

**6A-3. `citation` inline node.** ⇐ 6A-2 · *Library*
- File: `packages/plugins/src/citation.ts` (new) — schema from §3.2; `addNodeView` renders `CiteEngine.renderCluster` and subscribes to `change`.
- Accept: inserting a citation node with a valid `sourceId` renders the styled in-text form; editing `locator` re-renders.

**6A-4. Extend the `footnote` node.** ⇐ 6A-2 · *Library*
- File: [packages/plugins/src/footnote.ts](../../packages/plugins/src/footnote.ts) — add `sourceId`/`locator`/`label` attrs (§3.3); node view and `renderHTML` branch on `sourceId`. **Keep `content`-only path byte-compatible** (existing docs unchanged).
- Coordinate with DOM numbering: [DocsEditor.vue updateFootnotes()](../../packages/vue/src/components/DocsEditor.vue) must render `CiteEngine.renderFootnote(node)` for citation-backed footnotes and the plain `content` otherwise; numbering pass unchanged.
- Accept: a free-text footnote still works; a `sourceId` footnote shows citeproc output and reformats on style switch; both are numbered by the existing pass.

**6A-5. `bibliography` node.** ⇐ 6A-2 · *Library*
- File: `packages/plugins/src/bibliography.ts` (new) — §3.4; node view renders `CiteEngine.renderBibliography()`; re-renders on `change`; empty-state safe.
- Accept: adding/removing citations updates the bibliography list live; no citations → placeholder/empty.

**6A-6. `citationPlugin` + registration + injection.** ⇐ 6A-3, 6A-4, 6A-5 · *Library*
- Files: `packages/plugins/src/citation.ts` (plugin export), [packages/plugins/src/index.ts](../../packages/plugins/src/index.ts) (add to exports + `defaultPlugins`), plugin options wiring in [packages/core/src/Editor.ts](../../packages/core/src/Editor.ts) / plugin options.
- `citationPlugin` via `definePlugin`: `tiptapExtensions: [CitationNode, BibliographyNode]` (footnote stays its own plugin), commands `insertCitation`/`insertBibliography`/`setCitationStyle`, toolbar + slash entries, and `hooks.onInit` that constructs the `CiteEngine` from injected `CitationOptions` (§3.6) and `onDestroy` that tears it down. `insertCitation` calls `onSourceRequest()` (app picker) when no `sourceId` supplied.
- Accept: `defaultPlugins` includes `citationPlugin`; inserting via toolbar/slash works; the engine is created once per editor and disposed on destroy.

**6A-7. Live style switching.** ⇐ 6A-6 · *Library*
- Files: `citeEngine.ts`, plugin command `setCitationStyle`, a toolbar/UI control (Vue) later in 6B.
- `setStyle(id)` reloads the CSL, recomputes all clusters + bibliography, emits `change`; all node views repaint. No PM transaction / schema rebuild.
- Accept: switching Chicago notes-bib ↔ Chicago author-date ↔ APA reformats every citation, footnote, and the bibliography with no reload and no PM content change.

### Stage 6B — Reference library · **APP** (`apps/server` + `apps/web`) · *needs Phase 3*

**6B-1. `Source` model.** ⇐ none · *App (server)*
- File: `apps/server/src/models/Source.ts` (new) — schema from §3.1; owner + text + sparse-unique-DOI indexes.
- Accept: model compiles; typecheck passes.

**6B-2. Reference-library CRUD + search API.** ⇐ 6B-1 · *App (server)*
- Files: `apps/server/src/routes/sources.ts` (new); mount in [apps/server/src/index.ts](../../apps/server/src/index.ts); follow the auth-guarded router pattern in [documents.ts](../../apps/server/src/routes/documents.ts).
- `GET /api/sources` (own + sharedWith, `?q=` text search), `POST`, `GET/:id`, `PUT/:id`, `DELETE/:id`, `POST /:id/share`. All return/accept CSL-JSON.
- Accept: create → list → search → update → delete round-trips; sharing exposes a source to a second user.

**6B-3. Reference-manager UI.** ⇐ 6B-2 · *App (web) + Library (Vue sidebar)*
- Files: new `packages/vue/src/components/sidebars/ReferencesSidebar.vue` (library UI shell, backend-agnostic — takes sources + callbacks as props) consumed by `apps/web`; `apps/web` supplies the data via the CRUD API.
- Search/browse the library, create/edit a source form, and an **insert-citation flow**: pick a source → call the library's `insertCitation` command with `{ sourceId, locator }`. Add a style selector (drives 6A-7).
- Accept: from the sidebar, insert a citation and a footnote citation; both render per active style; edit a source → all its citations update.

**6B-4. Injection wiring + per-doc embedded snapshot.** ⇐ 6B-2, 6B-3, 6A-6 · *App*
- Files: [apps/server/src/models/Document.ts](../../apps/server/src/models/Document.ts) (`sources[]`, `cslStyle` — §3.5), [documents.ts](../../apps/server/src/routes/documents.ts) (persist snapshot on save), `apps/web` editor view (pass `CitationOptions` into the editor: `sources` = snapshot ∪ live library, `style` = `Document.cslStyle`, `onSourcesChange` → update snapshot).
- On save, collect the CSL-JSON of every cited `sourceId` and write `Document.sources[]`; on load, seed the engine from the snapshot so the doc renders even if a library source was deleted.
- Accept: open a doc offline (library unreachable) → citations + bibliography still render from the snapshot; adding a new citation updates the snapshot on save.

### Stage 6C — Importers · **APP** (`apps/server` + `apps/web`) · order: manual → DOI/CrossRef → BibTeX/RIS → (Zotero deferred)

**6C-1. Manual entry form.** ⇐ 6B-2, 6B-3 · *App*
- Files: reference-manager form (6B-3) + `POST /api/sources`.
- Type-aware CSL-JSON form (book/article/webpage/chapter…) writing a `source:'manual'` record.
- Accept: create a book and a journal article by hand; both cite correctly in Chicago + APA.

**6C-2. DOI / URL lookup (CrossRef).** ⇐ 6B-2 · *App (server)*
- Files: `apps/server/src/services/crossref.ts` (new); `POST /api/sources/import/doi { doi | url }`.
- Fetch CrossRef metadata (server-side; on-prem has internet), map to CSL-JSON, dedupe by DOI (sparse-unique index, 6B-1), persist `source:'crossref'`.
- Accept: paste a DOI → a fully-populated source appears and cites correctly; re-importing the same DOI does not duplicate.

**6C-3. BibTeX / RIS import.** ⇐ 6B-2 · *App (server)*
- Files: `apps/server/src/services/bibImport.ts` (new; use a BibTeX/RIS→CSL-JSON parser lib); `POST /api/sources/import/bibtex` + `.../ris` (accept file or text, batch).
- Parse to CSL-JSON, batch-insert `source:'bibtex'|'ris'`, report per-entry success/failure.
- Accept: import a multi-entry `.bib` file → all valid entries become sources; malformed entries are reported, not silently dropped.

**6C-4. Zotero — deferred stub only.** ⇐ none · *App (out of scope; see §7)*
- No implementation this phase. Keep the `source:'zotero'` enum value + an importer-registry seam so it can be added later without a migration.

### Stage 6D — Cited export · **LIBRARY + APP** · *needs Phase 5*

**6D-1. Citations + bibliography in PDF/DOCX.** ⇐ 6A-7, Phase 5 export module · *Library + App*
- Files: the Phase 5 export module (PDF + DOCX mappers); export uses `CiteEngine` output (or a headless render of the node views) so exported citations/footnotes/bibliography match the on-screen style.
- Ensure footnote-style (Chicago notes-bib) renders as real PDF/DOCX footnotes and author-date renders in-text; bibliography renders as a formatted list.
- Accept: a document with DOI- and BibTeX-imported sources exports to PDF **and** DOCX with correct in-text citations, footnotes, and a correctly ordered bibliography.

### Group 6-Tests — Tests & verification · *Library + App*

**T1. Engine unit tests.** ⇐ 6A-2 — CSL-JSON in → expected strings for Chicago notes-bib, Chicago author-date, APA, MLA; style switch changes output; ibid./short-form ordering in notes-bib.
**T2. Node round-trip tests.** ⇐ 6A-3/6A-4/6A-5 — citation/bibliography/extended-footnote attrs survive `getJSON()` and the Phase 1 `yXmlFragmentToProsemirrorJSON` derivation (no rendered text persisted).
**T3. Importer tests.** ⇐ 6C — DOI mapping, BibTeX/RIS parsing, DOI dedupe.
**T4. E2E acceptance (the gate).** ⇐ all — insert source → cite in-text + as footnote (both render); switch Chicago ↔ APA → all reformat; edit a source → all its citations update; import via DOI and BibTeX; export to PDF/DOCX with correct citations + bibliography; open with library unreachable → snapshot still renders.

---

## 5. Sequencing

```
Phase 2 done ─► 6A-1 ─► 6A-2 ─┬─► 6A-3 ─┐
                              ├─► 6A-4 ─┼─► 6A-6 ─► 6A-7
                              └─► 6A-5 ─┘            │
                                                    │  (6A can ship standalone in apps/demo
                                                    │   with hardcoded sources — no backend)
Phase 3 done ─► 6B-1 ─► 6B-2 ─► 6B-3 ─► 6B-4 ◄──────┘
                        │
                        ├─► 6C-1
                        ├─► 6C-2
                        └─► 6C-3        (6C-4 Zotero: deferred, §7)

Phase 5 done + 6A-7 ─► 6D-1

6A-2 ─► T1 ; 6A-3/4/5 ─► T2 ; 6C ─► T3 ; everything ─► T4
```

- **6A (library) can start right after Phase 2** and be demoed in `apps/demo` with an in-memory
  source array — no backend, respecting the library-never-imports-backend rule.
- **6B (reference library) needs Phase 3** (`apps/web` product shell, auth, sharing).
- **6D (cited export) needs Phase 5** (the export module to extend).
- Land **6A-2 → 6A-6 → 6A-7 (live style switch)** first — that proves the derived-view engine —
  then 6B wiring, then importers, then export.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Double render / drift between PM state and citeproc output** (rendered text accidentally stored in a node attr) | Nodes store **only** `{ sourceId, locator, … }`; all text comes from `CiteEngine` at render time. Enforce with T2 (assert no rendered string in `getJSON()`). This is the #1 correctness invariant. |
| **Style switching leaves stale renders** (some node views not repainted, or notes-bib ordering wrong) | Single document-scoped `CiteEngine` recomputes **all** clusters in document order and emits one `change`; every node view subscribes. Validate ibid./short-form ordering in T1. |
| **Offline snapshot vs library drift** (a cited source is edited/deleted in the library after the doc was saved) | `Document.sources[]` embedded snapshot is authoritative for *rendering*; live library is authoritative for *editing*. On load, seed engine from snapshot; offer a "refresh from library" action rather than silent divergence (6B-4). |
| **citeproc-js bundle size** (adds meaningful weight + 4 bundled CSL files) | Ship the engine wrapper + CSL as a lazy-loaded chunk; make `citeproc` a peer/optional dep so consumers who don't cite pay nothing; load styles on demand. The `citationPlugin` only pulls the engine when actually used. |
| **Custom-node collab/persistence tie-in (Phase 1)** — new node attrs must round-trip through `yXmlFragmentToProsemirrorJSON` and converge across clients | New attrs are plain JSON; no rendered text persisted → two clients with same sources+style derive identical output. Add citation/bibliography/extended-footnote to the Phase 1 custom-node snapshot-compare (the pageBreak/footnote/pagination round-trip test). |
| **Footnote backward compatibility** (existing free-text footnotes must not break) | `content` attr kept; `sourceId` defaults `null`; node view/`updateFootnotes()` branch on `sourceId`. Existing docs render unchanged (covered by T2). |
| **CrossRef/import reliability** (network, malformed BibTeX) | Importers are server-side (on-prem has internet); per-entry error reporting; DOI dedupe via sparse-unique index; never partial-write a batch silently (6C-2/6C-3). |

## 7. Out of Scope (this phase)

- **Zotero integration — deferred.** Heaviest importer; depends on Zotero's API/auth model. Only
  the `source:'zotero'` enum value + an importer-registry seam are reserved (6C-4); no code.
- **RAG / cited AI drafting** — Phase 7E consumes this reference library; not built here.
- **Cited export beyond PDF/DOCX** (e.g. LaTeX/BibTeX *export*) — not in scope; import only.
- **Cross-document / global bibliography** — one bibliography per document this phase.
- **Custom CSL style upload/editing UI** — bundled styles only (Chicago ×2, APA, MLA); arbitrary
  CSL upload is a later enhancement.
- **Multi-locale citation rendering** — en-US locale bundled; other locales deferred.
