# Library Contract — DocsEditor

**Status:** Living document · **Owner:** Kedata Indonesia · **Last updated:** 2026-10-08

> This file is the **single source of truth for the library/app boundary**. It catalogues
> every injection port through which the library (`packages/*`) may reach backend concerns,
> states the rules for library authors, and records known deviations with their owning phase.
>
> **Maintenance rule:** when a later phase adds or changes a port, update this file **in the
> same PR** (Phase 2 adds `onImageUpload`; Phase 5 adds export hooks). A contract that drifts
> from the code is worse than no contract.

---

## 1. The Principle

From [ENHANCEMENT_ROADMAP.md §1](ENHANCEMENT_ROADMAP.md):

> **The library must know nothing about the backend.** Persistence, auth, and storage are
> the host app's job, reached only through narrow injectable interfaces. Everything
> backend-specific (Mongo, better-auth, sharing, folders, object storage) lives in
> `apps/server` / `apps/web`, never in `packages/*`.

A change that respects this principle touches either the library *or* the app — rarely both.

```
  ┌──────────────────────── apps/* (backend concerns) ─────────────────────────┐
  │  apps/server: Mongo, better-auth, storage, collab WS, AI route              │
  │  apps/demo : thin, backend-free showcase (defaultPlugins, webrtc/local)     │
  └───────────────▲──────────────────────────────▲─────────────────────────────┘
                  │ implements ports              │ implements ports
        ┌─────────┴───────── INJECTION PORTS (this contract) ─────────┐
        │  onUpdate(json)            collaboration: CollaborationOptions│
        │  onImageUpload(file)→url   export hooks   [future]           │
        └─────────▲───────────────────────────────────────────────────┘
                  │ declares ports, never implements backend
  ┌───────────────┴──────────────── packages/* (the library) ──────────────────┐
  │  core (ports on EditorOptions)  vue (props/emits)  element (attrs)          │
  │  plugins · layout-engine                                                    │
  └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Port Catalogue

### 2.1 Existing ports

| Port | TypeScript signature | Declared at | Host-app responsibility |
|------|----------------------|-------------|-------------------------|
| `onUpdate` | `(json: object) => void` | `EditorOptions` — [packages/core/src/Editor.ts:28](../packages/core/src/Editor.ts) | Persist the document JSON for **single-user / non-collaborative** documents. In collaboration mode the Yjs document is authoritative and this hook must not be used as the edit source (see [phase-1-collab-persistence.md](plans/phase-1-collab-persistence.md)). |
| `collaboration` | `CollaborationOptions` — see field table below | `EditorOptions` — [Editor.ts:29](../packages/core/src/Editor.ts); interface — [Collaboration.ts:15-23](../packages/core/src/Collaboration.ts) | Supply the full collaboration configuration: room id, transport provider, signaling/websocket endpoints, user identity, and awareness callback. The library never picks endpoints on its own; webrtc without explicit `signaling` is localhost-only with a one-time warning (Phase 2). |
| `onImageUpload` | `(file: File) => Promise<ImageUploadResult>` (`{ src, alt?, title? }`) | `EditorOptions` — [Editor.ts:33](../packages/core/src/Editor.ts); type — [ports.ts](../packages/core/src/ports.ts); carried in `editor.storage.editorContext` ([EditorContext.ts](../packages/core/src/EditorContext.ts)) | Store the user's picked file (object storage — Phase 4) and resolve its URL. With no handler, `insertImage` falls back to a URL prompt; the library never names a storage host. |
| `aiStream` | `AIStreamFn` — `(req: AIActionRequest, signal: AbortSignal) => AsyncIterable<string>` | `EditorOptions` — [Editor.ts:122](../packages/core/src/Editor.ts); type — [ai/types.ts](../packages/core/src/ai/types.ts); carried in `editor.storage.editorContext` ([EditorContext.ts](../packages/core/src/EditorContext.ts)) | Provide the AI completion transport (Phase 7; promoted to a declared port by [PLUGGABLE_AI_PROVIDER](plans/PLUGGABLE_AI_PROVIDER.md)). The library never names an LLM endpoint: hosts inject `toAIStreamFn(openaiCompatibleProvider({ baseUrl, auth, model }))` or a custom function wrapping their own backend/agent. With no port injected, AI actions are inert (one-time `console.warn`). |
| `aiDraft` | `AIDraftFn` — `(req: { prompt, context?, k? }, signal: AbortSignal) => AsyncIterable<AIDraftEvent>` | `EditorOptions` — [Editor.ts:124](../packages/core/src/Editor.ts); type — [ai/types.ts](../packages/core/src/ai/types.ts); carried in `editor.storage.editorContext` | Opt-in RAG-cited drafting transport (Phase 7E): streams text with `[n]` markers plus a terminal citation table. Hosts plug their own corpus/RAG backend; the library only maps markers to citation nodes. Disabled when not injected. |
| `citation` | `CitationPort` — see field table below | `EditorOptions` — [Editor.ts:58-59](../packages/core/src/Editor.ts); interface — [ports.ts:67](../packages/core/src/ports.ts); carried in `editor.storage.editorContext` | Supply the reference library (CSL-JSON) and own all citation persistence. The library never fetches, stores, or looks up sources itself — no CrossRef call, no DOI resolution, no storage. Mirrors the `onImageUpload` injection pattern. Without the port, citation UI stays hidden/inert. |

**`CollaborationOptions` fields** ([Collaboration.ts:15-23](../packages/core/src/Collaboration.ts)):

| Field | Type | Notes |
|-------|------|-------|
| `room` | `string` | Required. Room/document identifier. |
| `provider` | `'webrtc' \| 'websocket'` | Optional. `webrtc` = zero-config P2P; `websocket` = production path via own server. |
| `websocketUrl` | `string` | Required when `provider === 'websocket'` (throws otherwise). |
| `signaling` | `string[]` | Optional webrtc signaling servers. Without it webrtc is **localhost-only** (+ same-browser BroadcastChannel) and logs a one-time warning — public-server defaults were removed in Phase 2. |
| `user` | `{ name: string; color: string }` | Required. Identity shown to collaborators. |
| `onAwarenessChange` | `(states: AwarenessState[]) => void` | Optional presence/cursor callback. |
| `initialStorageState` | `Uint8Array` | Optional Yjs state to seed the room (e.g. from host persistence). |

**`CitationPort` fields** ([ports.ts:67](../packages/core/src/ports.ts)):

| Field | Type | Notes |
|-------|------|-------|
| `sources` | `CslItemData[] \| (() => CslItemData[])` | Required. CSL-JSON snapshot of the host's reference library — an array or a getter for live data. ⚠️ **Read once at setup, not reactive** — see integration rules below. |
| `style` | `string` | Optional CSL style id; defaults to `'chicago-notes-bibliography'`. |
| `onSourceRequest` | `() => Promise<string \| null>` | Optional. Opens the host's source picker when the user inserts a citation. Must resolve with the chosen **`sourceId`**, or `null` when cancelled. When absent, the Vue component falls back to the built-in references sidebar picker. |
| `onSourcesChange` | `(ids: string[]) => void` | Optional. Fires with the list of **source ids cited in the document** (`engine.getCitedSourceIds()`) — *not* the source objects and *not* a library-snapshot event (for that, see `citation-sources-change` in §2.3). |
| `onImportDoi` | `(doi: string) => Promise<CslItemData \| null>` | Optional. Resolve a DOI via the host backend (e.g. CrossRef) and return the persisted source (`null` on failure). Enables the DOI importer UI. |
| `onImportBibliography` | `(payload: { format: 'bibtex' \| 'ris'; text: string }) => Promise<{ imported: CslItemData[]; failed: number }>` | Optional. Parse + persist a BibTeX/RIS blob via the host backend. Enables the file importer UI. |

**Citation integration rules** (learned the hard way — violate these and the reference library silently misbehaves):

1. **Gate the mount on loaded sources.** `citation.sources` is snapshotted once when the editor is created (`useCitations.ts:38-45`) — later updates to the prop do **not** propagate. Hosts must render `<DocsEditor v-if="sourcesLoaded">` (as `apps/web` does) or the references sidebar stays permanently empty until a remount.
2. **Updates are pushed through the engine, not the prop.** Source CRUD flows `syncCitationEngine()` → `CiteEngine.updateSources()` → recompute → `emitChange()`; the component re-renders citations from the live internal copy, so hosts don't re-feed `sources` after mount.
3. **The `footnotePlugin` is required.** The default style `chicago-notes-bibliography` is a note style, so `buildCitationNodes()` emits `type: 'footnote'` and insertion **fails silently** (`return false`) when `editor.schema.nodes['footnote']` is missing. Register `footnotePlugin` alongside `citationPlugin` (both are in `defaultPlugins`).
4. **`onSourceRequest` returns `Promise<string | null>`** — resolve with a `sourceId`, or `null` to cancel. A `void` promise leaves the pending citation hanging.
5. **`onSourcesChange` receives ids, not objects.** It is the *document-level* cited-id set, useful for embedding a per-document snapshot. Library-level CRUD persistence uses the `citation-sources-change` emit (§2.3).
6. **Insert citations via `pluginActions.insertCitation({ sourceId })`.** The internal `insertCitationWithSource` is not exported — `packages/plugins` public surface is `citationPlugin`, `CitationNode`, `CitationEngineExtension`, `getCitationEngine`, `buildCitationNodes`.

**Custom references sidebar (`#references-sidebar` slot, issue #22).** Hosts that need a picker
richer than the built-in sidebar — e.g. semantic knowledge-base search returning snippets with
page numbers/relevance — can replace it wholesale:

```vue
<DocsEditor :citation="citation">
  <template #references-sidebar="{ sources, activeStyle, pickerMode, onInsert, onClose }">
    <MyKbPicker :sources="sources" :active-style="activeStyle" :picker-mode="pickerMode"
                @select="onInsert" @close="onClose" />
  </template>
</DocsEditor>
```

- Renders **in place of** `ReferencesSidebar`, only while `activeSidebar === 'references'`.
  Omit the slot and the built-in sidebar is used — fully backward compatible.
  The scoped props are typed as **`ReferencesSidebarSlotProps`** (re-exported from the package),
  so consuming apps get `vue-tsc`/IDE checking on the slot.
- **Scoped props:** `sources`, `activeStyle`, `pickerMode`, `canImport`, `importing`,
  `importMessage`; **actions:** `onInsert(sourceId)`, `onClose()`, `onCreate(source)`,
  `onUpdate(source)`, `onRemove(id)`, `onStyleChange(styleId)`, `onImportDoi(doi)`,
  `onImportBibliography(payload)`.
- **Picker flow:** leave `CitationPort.onSourceRequest` **unset** so the built-in
  `defaultSourceRequest` opens the sidebar in picker mode (`pickerMode === true`); call
  `onInsert(sourceId)` to complete the pending citation, or `onClose()` to cancel. (If the host
  sets `onSourceRequest`, it owns the picker entirely and the sidebar never enters picker mode.)
- The host owns the sidebar's sizing/positioning (the built-in uses `w-80`, right-aligned) and
  does its own fetching — the library still performs **no** network I/O.

> **Seeding rule (Phase 1):** in collab mode the `content` option is **not**
> auto-seeded into the room — an unguarded local seed races with other clients
> and duplicates the document. Hosts seed via `initialStorageState` or a guarded
> server flow (`POST /api/collab/seed` in `apps/server`).

### 2.2 Planned ports (catalogued, not yet implemented)

| Port | Planned signature | Phase | Replaces |
|------|-------------------|-------|----------|
| Export hooks | TBD in Phase 5 design | [Phase 5](plans/phase-5-export-pdf-docx.md) | Host-side export wiring; today only the `export` emit exists (§2.3). |
| `CitationPort.onSourceSearch` | `(query: string) => Promise<SourceSearchResult[]>` where `SourceSearchResult = { source: CslItemData; snippet?: string; score?: number; locator?: string }` | — | A **host-bound search** rendered inside the *built-in* references sidebar (a search box appears only when the port is provided; results replace the list while searching, then the CRUD list returns). Complements the `#references-sidebar` slot (§2.1) for hosts that want search **and** the built-in add/import UI. |

**When to build it:** the issue upstream of this table ([#22](https://github.com/Kedata-Indonesia/docflow/issues/22)) deliberately *defers* `onSourceSearch`. Implement it **port-only** (no extra slot) once one of these fires: a second host needs KB-style search, `fe-aktifai` wants to retire its separate picker modal, or users find the separate modal confusing. Until then the `#references-sidebar` replace slot is the extension point — the library itself never fetches.

### 2.3 Related host-interaction surface (not backend ports)

These props/emits wire the host app into editor chrome but carry **no backend concern**;
they are listed here so reviewers don't mistake them for leaks:

- `export` emit — [DocsEditor.vue:67](../packages/vue/src/components/DocsEditor.vue):
  `export: [format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf']`.
  The host (or the component's built-in print path for PDF) produces the file.
- `citation-sources-change` emit — [docsEditorContracts.ts:154](../packages/vue/src/components/docsEditorContracts.ts), fired from [useCitations.ts:91](../packages/vue/src/composables/useCitations.ts):
  `[sources: CslItemData[]]`. **Full snapshot of the reference library after every source CRUD** (create / update / remove / import). This is the persistence channel — hosts that store sources (e.g. `apps/web`) listen to it and write the array back.
  ⚠️ Do not confuse with `CitationPort.onSourcesChange` (§2.1), which carries **only the ids of sources cited in the document** — a document-level event, not library persistence.
- `update:citation-style` emit — [docsEditorContracts.ts:156](../packages/vue/src/components/docsEditorContracts.ts), fired from [useCitations.ts:112](../packages/vue/src/composables/useCitations.ts):
  `[style: string]`. Fired when the user picks a different CSL style; hosts persist the preference and can re-supply it via `citation.style` on next mount.

  ```vue
  <DocsEditor
    :citation="citationPort"
    @citation-sources-change="persistSources"
    @update:citation-style="persistStyle"
  />
  ```
- `share`, `toggle-star`, `back`, `menu-click`, `update:title`, `update:pageSize`,
  `update:pageCount`, `update:locale` emits — pure UI intent signals.
- `shareUrl`, `documentMeta`, `collaborators`, `connectionState`, `userName`, `userAvatar`
  props — host-supplied display data, rendered but never fetched by the library.

---

## 3. Threading Map

How each existing port flows through the layers (verified 2026-07-19):

### `onUpdate`

| Layer | Wiring |
|-------|--------|
| core | Declared on `EditorOptions` — [Editor.ts:28](../packages/core/src/Editor.ts); invoked inside `createTiptapEditor` as `options.onUpdate?.(editor.getJSON())` — [Editor.ts:198-200](../packages/core/src/Editor.ts) |
| vue (composable) | Accepted on `UseEditorOptions` — [useEditor.ts:7](../packages/vue/src/composables/useEditor.ts); forwarded to `createEditor` — [useEditor.ts:41](../packages/vue/src/composables/useEditor.ts) |
| vue (component) | `DocsEditor.vue` passes a handler — [:191](../packages/vue/src/components/DocsEditor.vue) — that reassembles the tabbed document and re-emits it as `update:modelValue` — [:202](../packages/vue/src/components/DocsEditor.vue) |
| element | No dedicated attribute; `defineCustomElement` re-dispatches the Vue component's emits as DOM `CustomEvent`s, so hosts listen for `update:modelValue` |

### `collaboration`

| Layer | Wiring |
|-------|--------|
| core | Declared on `EditorOptions` — [Editor.ts:29](../packages/core/src/Editor.ts); consumed by `createEditor` → `createCollaboration` — [Editor.ts:90-92](../packages/core/src/Editor.ts); implementation — [Collaboration.ts:50-96](../packages/core/src/Collaboration.ts) |
| vue (composable) | Accepted on `UseEditorOptions` — [useEditor.ts:9](../packages/vue/src/composables/useEditor.ts); forwarded — [useEditor.ts:40](../packages/vue/src/composables/useEditor.ts); watched for `room`/`provider` changes with editor rebuild — [useEditor.ts:76-89](../packages/vue/src/composables/useEditor.ts) |
| vue (component) | `collaboration` prop typed `NonNullable<EditorOptions['collaboration']>` — [DocsEditor.vue:27](../packages/vue/src/components/DocsEditor.vue) |
| element | `room` + `websocket-url` attributes mapped to a collaboration config (websocket provider when `websocket-url` is set, webrtc otherwise) — [DocsEditorElement.ts:70-82](../packages/element/src/DocsEditorElement.ts) |

### `onImageUpload`

| Layer | Wiring |
|-------|--------|
| core | Declared on `EditorOptions` — [Editor.ts:33](../packages/core/src/Editor.ts); carried by the always-registered `EditorContextExtension` into `editor.storage.editorContext` — [EditorContext.ts](../packages/core/src/EditorContext.ts), wired in [Editor.ts](../packages/core/src/Editor.ts) |
| plugins | `imagePlugin.insertImage` reads the port from storage — with a handler: file picker → `await onImageUpload(file)` → `setImage(result)`; without: URL prompt fallback (no default host) — [image.ts](../packages/plugins/src/image.ts) |
| vue (composable) | Forwarded via `UseEditorOptions` into `createEditor` — [useEditor.ts](../packages/vue/src/composables/useEditor.ts) |
| vue (component) | `onImageUpload` prop, forwarded to `useEditor` — [DocsEditor.vue](../packages/vue/src/components/DocsEditor.vue) |
| element | JS property `el.onImageUpload` with a setter that re-applies props (functions can't be HTML attributes) — [DocsEditorElement.ts](../packages/element/src/DocsEditorElement.ts) |

### `aiStream` / `aiDraft`

| Layer | Wiring |
|-------|--------|
| core | Declared on `EditorOptions` — [Editor.ts:61-63](../packages/core/src/Editor.ts); carried by the always-registered `EditorContextExtension` into `editor.storage.editorContext` — [EditorContext.ts](../packages/core/src/EditorContext.ts), forwarded in [Editor.ts:238-239](../packages/core/src/Editor.ts). Default transport + adapter ship in [packages/core/src/ai/](../packages/core/src/ai) (`openaiCompatibleProvider`, `toAIStreamFn`, `KeyStorage` impls) |
| plugins | `aiPlugin` reads `editorContext.aiStream` for inline transforms / generation — [ai.ts](../packages/plugins/src/ai.ts); no shape change, no endpoint knowledge |
| vue (component) | `AISidebar.vue` accepts `aiStream` / `aiDraft` props and falls back to `editor.storage.editorContext` — [AISidebar.vue:75-82](../packages/vue/src/components/sidebars/AISidebar.vue) |
| vue (composable) | `useAIProvider(editor)` exposes the injected ports reactively — [useAIProvider.ts](../packages/vue/src/composables/useAIProvider.ts); provider + key-storage impls re-exported from [packages/vue/src/index.ts](../packages/vue/src/index.ts) |
| element | Not wired — embedded hosts using the Web Component inject transports via JS properties (planned; see [PLUGGABLE_AI_PROVIDER](plans/PLUGGABLE_AI_PROVIDER.md)) |

### `citation`

| Layer | Wiring |
|-------|--------|
| core | Declared on `EditorOptions` — [Editor.ts:58-59](../packages/core/src/Editor.ts); carried into `editor.storage.editorContext` — [Editor.ts:233-237](../packages/core/src/Editor.ts) |
| plugins | `citationPlugin` reads the port at init and creates the `CiteEngine` ([citation.ts:280](../packages/plugins/src/citation.ts)); citations render as footnote-backed nodes, so `footnotePlugin` is required (integration rule 3) |
| vue (composable) | `useCitations` snapshots the port's sources once, owns the live copy, and re-emits CRUD as `citation-sources-change` / `update:citation-style` — [useCitations.ts](../packages/vue/src/composables/useCitations.ts) |
| vue (component) | `citation` prop — [docsEditorContracts.ts:66](../packages/vue/src/components/docsEditorContracts.ts) |
| element | Not wired — embedded hosts pass the port as a JS property. |

---

## 4. Rules for Library Authors

**Deny-list for `packages/*`:**

1. ❌ No imports from `apps/*` (relative paths or workspace package names
   `@kedata-indonesia/docflow-server` / `@kedata-indonesia/docflow-demo`).
   → *Enforced by ESLint `no-restricted-imports`, currently `error` (§5).*
2. ❌ No backend-only dependencies: `mongoose`, `express`, `better-auth` (incl. `better-auth/*`).
   → *Same ESLint rule.*
3. ❌ No direct backend HTTP calls (`fetch('/api/*')`, hardcoded API hosts).
   → *Not lint-catchable (string-based); review-gated. See deviation #1.*
4. ❌ No hardcoded external URLs / CDNs / storage endpoints.
   → *Review-gated. See deviations #2, #3.*
5. ❌ No document persistence inside the library (`localStorage` drafts, IndexedDB, etc.) —
   persistence is the host's job via `onUpdate`.
   → *Review-gated. See deviation #4.*
   ✅ *Exception:* presentation preferences (theme, locale) may use `localStorage` —
   they are UI chrome state, not document data.

**Escape hatch — add a port, not a leak.** If a library feature needs something from the
backend (upload, AI, directory lookup, …), do not reach out directly. Instead:

1. Declare a narrow option/prop/emit on the core `EditorOptions` (or the plugin contract).
2. Implement the backend call in the **host app**, which passes the implementation in.
3. Document the new port in §2 of this file **in the same PR**, including its threading map.

A PR that touches both `packages/*` and `apps/*` for a single concern is a smell — expect
reviewers to ask which side of the boundary it really belongs on.

---

## 5. Known Deviations

Violations of this contract and their status. All known deviations are now
resolved — deviation #1 was closed by the pluggable AI provider work
([PLUGGABLE_AI_PROVIDER](plans/PLUGGABLE_AI_PROVIDER.md)); the rest were
resolved in Phase 2.

| # | Deviation | Location | Class | Status | Remediation |
|---|-----------|----------|-------|--------|-------------|
| 1 | `AISidebar.vue` fetched the AI backend directly | [AISidebar.vue](../packages/vue/src/components/sidebars/AISidebar.vue) — previously `fetch(\`${API_BASE}/api/ai/copilot\`)` | Direct backend call (rule 3) | ✅ **Resolved** ([PLUGGABLE_AI_PROVIDER](plans/PLUGGABLE_AI_PROVIDER.md)) | AI is behind the host-injected `aiStream` / `aiDraft` ports (§2.1) with a browser-side default transport (`openaiCompatibleProvider`); no `fetch` to any AI endpoint remains in `packages/*` (`grep -rn "fetch.*api/ai" packages` returns nothing). |
| 2 | Image plugin hardcoded `via.placeholder.com` + `window.prompt` fallback | `packages/plugins/src/image.ts` (pre-Phase-2) | Hardcoded external URL / storage assumption (rule 4) | ✅ **Resolved in Phase 2** | Replaced by the `onImageUpload` port (§2.1); URL prompt kept as an explicit no-host fallback. |
| 3 | webrtc signaling defaulted to public servers (`wss://signaling.yjs.dev`, `wss://y-webrtc-eu.fly.dev`) | `packages/core/src/Collaboration.ts` (pre-Phase-2) | External-network assumption (rule 4) | ✅ **Resolved in Phase 2** | Defaults to localhost-only + one-time `console.warn`; cross-network webrtc requires explicit `signaling`; websocket + own server is the documented production path. |
| 4 | Document draft autosave to `localStorage` (`docs-editor-current-doc`) | `packages/vue/src/components/DocsEditor.vue` (pre-Phase-2) | Document persistence in the library (rule 5) | ✅ **Resolved in Phase 2** | Write removed (it was never read anywhere); hosts persist via `update:modelValue` / `onUpdate`. |

> The theme/locale `localStorage` uses in `useTheme.ts` / `useLocale.ts` are **not**
> deviations — they are presentation preferences, allowed by the rule-5 exception in §4.

### 5.1 Guardrail & escalation path

The ESLint guardrail in [.eslintrc.cjs](../.eslintrc.cjs) (override scoped to
`packages/**/*.{ts,vue}`, built-in `no-restricted-imports`, zero new dependencies) ships as
**`error`** — a regression trap for future PRs that now fails CI on a violation.

- **Coverage:** import boundaries only (rules 1–2). String-based backend calls
  (`fetch('/api/*')`, rule 3) are not import statements and stay review-gated; a custom AST
  rule is out of scope.
- **Escalation:** deviation #1 (the Phase 7 `AISidebar` leak) is resolved, so the severity was
  raised from `'warn'` to `'error'` in `.eslintrc.cjs` (2026-10). Softening back to `'warn'`
  is a one-line change if ever needed.
- **Baseline:** as of 2026-10 the boundary holds structurally —
  `grep -rn "apps/" packages --include=*.ts --include=*.vue` returns no imports,
  `pnpm lint` emits zero `no-restricted-imports` violations (0 errors), and all known
  deviations (#1–#4) are resolved.
