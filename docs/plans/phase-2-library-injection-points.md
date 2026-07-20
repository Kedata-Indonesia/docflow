# Phase 2 — Library Boundary Completion (Injection Points) · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 2 · **Priority:** P0 · **Status:** ✅ Implemented (pending maintainer acceptance) · **Last updated:** 2026-07-19

> **Goal:** remove backend assumptions leaking into the library. The library (`packages/*`)
> must reach persistence, storage, and infrastructure **only through narrow injectable ports**,
> and must make **zero external network calls** with a self-host-safe configuration.
> Two ports plus one audit: **(A)** an injectable `onImageUpload(file) => Promise<{ src }>`
> threaded core → vue → element; **(B)** collaboration defaults that never phone home to public
> signaling servers; **(C)** an audit of `packages/*` for remaining external URLs / backend assumptions.

**Status note (2026-07-19):** all groups implemented — `onImageUpload` port (core
`EditorContextExtension` → vue prop → element property), `insertImage` rewritten
(placeholder.com deleted; prompt fallback kept), webrtc defaults localhost-only + one-time
warning, library `localStorage` document persistence removed (dead write), contract refreshed
(deviations #2–#4 resolved; #1 → Phase 7). Tests: 87/87 workspace. Demo wires a sample
`URL.createObjectURL` handler in `EditorView.vue`.

---

## 1. Current State (what we're replacing)

Backend/infrastructure assumptions are **hardcoded inside the library packages**:

| # | Assumption | What it does today | File |
|---|-----------|--------------------|------|
| A | Placeholder image host | `insertImage` defaults to `https://via.placeholder.com/300x200`; no way to inject an upload handler; asks for a URL via `window.prompt` | [image.ts:5,13-24](../../packages/plugins/src/image.ts) |
| B | Public webrtc signaling | webrtc provider defaults `signaling` to `ws://localhost:4444`, `wss://signaling.yjs.dev`, `wss://y-webrtc-eu.fly.dev` when caller passes none | [Collaboration.ts:57-64](../../packages/core/src/Collaboration.ts) |
| C1 | Hardcoded AI backend route | `AISidebar` `fetch(`${API_BASE}/api/ai/copilot`)` + `import.meta.env.VITE_API_BASE_URL` — the library assumes a specific server endpoint exists | [AISidebar.vue:6,27](../../packages/vue/src/components/sidebars/AISidebar.vue) |
| C2 | Library-owned persistence | `<DocsEditor>` auto-writes doc JSON to `localStorage['docs-editor-current-doc']` — the library, not the host, decides where content persists | [DocsEditor.vue:171,392](../../packages/vue/src/components/DocsEditor.vue) |
| C3 | URL-prompt fallbacks | `insertImage` / `setLink` / bubble-menu link use `window.prompt('…','https://')` | [image.ts:18](../../packages/plugins/src/image.ts), [link.ts:21](../../packages/plugins/src/link.ts), [BubbleMenu.vue:73](../../packages/vue/src/components/BubbleMenu.vue) |

**How options thread today (the wiring we extend):**
- `EditorOptions` ([Editor.ts:23-32](../../packages/core/src/Editor.ts)) is the single core entry contract; `createTiptapEditor` ([Editor.ts:156-202](../../packages/core/src/Editor.ts)) turns it into a TipTap editor. Editor-level config already flows to extensions here — e.g. `getPageMap` configures `BlockAttributesExtension` ([Editor.ts:166-168](../../packages/core/src/Editor.ts)).
- Plugin `commands` receive **only** `(editor, ...args)` ([PluginSystem.ts:22-23,58-84](../../packages/core/src/PluginSystem.ts)); they have no access to `EditorOptions`. So a per-editor injected handler must be reachable **through the editor instance** (extension storage), not through a module-level constant.
- Vue: `useEditor` maps its options 1:1 into `createEditor` ([useEditor.ts:30-51](../../packages/vue/src/composables/useEditor.ts)); `UseEditorOptions` extends `EditorOptions` ([useEditor.ts:4-12](../../packages/vue/src/composables/useEditor.ts)). `<DocsEditor>` declares typed props and calls `useEditor(...)` ([DocsEditor.vue:17-44,150-173](../../packages/vue/src/components/DocsEditor.vue)).
- Element: `DocsEditorElement` builds props from **string attributes** in `_buildProps()` and passes non-serializable values (e.g. `plugins`) as **JS properties** with a setter that re-applies props ([DocsEditorElement.ts:12,18-27,56-90](../../packages/element/src/DocsEditorElement.ts)). `collaboration` is assembled here from `room` + `websocket-url`; with no `websocket-url` the element produces a provider-less (local-only) collab config.

**Key fact for workstream B:** a self-host install using `provider: 'websocket'` with its own `websocketUrl` already makes **no external calls** — the only leak is the webrtc default signaling list. y-webrtc also syncs same-browser tabs over `BroadcastChannel` regardless of signaling, so the demo's same-machine multi-tab showcase does **not** depend on the public servers.

---

## 2. Target Architecture

One new core "port" (`onImageUpload`) threads down the same path every other option already travels; collaboration defaults lose their public-server fallback.

```
 (A) onImageUpload port                          (B) collab signaling
 ─────────────────────                           ────────────────────
 host app supplies a handler                     webrtc: signaling REQUIRED (no public default)
        │                                         websocket: websocketUrl REQUIRED (unchanged)
        ▼
 element:  el.onImageUpload = fn  (JS property, not attribute)
        │  _buildProps() → prop
        ▼
 vue:     <DocsEditor :on-image-upload="fn">
        │  prop → useEditor({ onImageUpload })
        ▼
 core:    createEditor({ onImageUpload })  ──►  EditorOptions.onImageUpload
        │                                        │
        │  createTiptapEditor()                  ▼
        │  EditorContextExtension.configure({ onImageUpload })   ← carries ports in extension storage
        ▼                                        │
 plugin:  imagePlugin.insertImage(editor)  ◄─────┘ reads editor.storage.editorContext.onImageUpload
        │
        ├─ handler present → pick file → await onImageUpload(file) → setImage({ src })
        └─ no handler      → window.prompt('Enter image URL') → setImage (NO via.placeholder default)
```

**Design decisions:**

1. **Ports reach plugins via extension storage, not globals.** Plugin commands only get `(editor, …)`, so a new internal core extension `EditorContextExtension` carries injected ports (`onImageUpload`, and future ports) in its TipTap `storage`. This mirrors how `getPageMap` is handed to `BlockAttributesExtension`. `defaultPlugins` stays a **static array** — no factory/config needed at plugin-construction time.
2. **`onImageUpload` is asynchronous; `insertImage` stays synchronous.** The command kicks off the async flow (open file picker → `await` handler → `setImage`) and returns `true` immediately; the actual node insertion happens inside the resolved promise. This keeps the `DocsEditorPlugin.commands` contract (`=> boolean`) untouched.
3. **Fallback, not default host.** With no handler, `insertImage` prompts for a URL and inserts that; the `via.placeholder.com` constant is **deleted**. The library never names a storage location.
4. **Webrtc requires explicit signaling.** The public-server list is removed. When `provider: 'webrtc'` and no `signaling` is given, default to **localhost-only** (`['ws://localhost:4444']`) and emit a one-time `console.warn` that production self-host must run its own signaling server or use `provider: 'websocket'`. This keeps the demo's local/BroadcastChannel showcase working while never contacting public infrastructure. (Alternative considered: `throw` like the websocket path — rejected because it breaks the "demo works with defaults" acceptance.)
5. **Element passes functions as properties.** Web Component attributes are strings; `onImageUpload` is exposed as a JS property setter (like `plugins`), never an `observedAttribute`.
6. **Audit findings that belong to later phases are flagged, not fixed here.** The AI route (C1) is Phase 7's provider abstraction; object storage behind the upload handler is Phase 4. Phase 2 records them in the contract and removes only what is cheap and in-scope.

---

## 3. Interface / Type Definitions

New port type + option (core), plus the carrier extension. Signatures below are the contract every layer forwards unchanged.

```ts
// packages/core/src/ports.ts (new) — the injectable "ports" a host implements
export interface ImageUploadResult {
  src: string          // resolved URL/href the host stored the file at (Phase 4 fills this in)
  alt?: string
  title?: string
}
export type ImageUploadHandler = (file: File) => Promise<ImageUploadResult>

// packages/core/src/Editor.ts — EditorOptions gains one field
export interface EditorOptions {
  // …existing fields (target, content, plugins, editable, onUpdate, collaboration, getPageMap, paginationOptions)…
  onImageUpload?: ImageUploadHandler
}

// packages/core/src/EditorContext.ts (new) — internal carrier, always added like TextStyle
export interface EditorContextOptions {
  onImageUpload?: ImageUploadHandler
}
// registers as name 'editorContext'; exposes options in storage so plugin commands can read
//   (editor.storage.editorContext as EditorContextOptions).onImageUpload
```

Flow of the value:

```ts
// element: property, not attribute
set onImageUpload(fn: ImageUploadHandler) { /* store; re-apply _buildProps() */ }
// _buildProps() → { …, onImageUpload: this._onImageUpload }

// vue: prop → composable → core
defineProps<{ onImageUpload?: ImageUploadHandler }>()          // DocsEditor.vue
useEditor({ /* … */ onImageUpload: props.onImageUpload })      // passes through
export interface UseEditorOptions extends /* … */ { onImageUpload?: ImageUploadHandler }  // useEditor.ts
createEditor({ /* … */ onImageUpload: options.onImageUpload }) // useEditor.ts

// collaboration options: signaling stays optional, default changes (no public servers)
export interface CollaborationOptions { /* … */ signaling?: string[] }
```

No changes to `DocsEditorPlugin` or the `onUpdate`/`collaboration` contracts.

---

## 4. Task Breakdown

Tasks grouped by workstream (A/B/C). Each lists files, work, acceptance, layer, and dependencies (`⇐`).

### Group A — Injectable image upload (core → vue → element)

**A1. Define the port type + option.** ⇐ none · *layer: core*
- Files: `packages/core/src/ports.ts` (new); [Editor.ts](../../packages/core/src/Editor.ts) (`EditorOptions`); `packages/core/src/index.ts` (export `ImageUploadHandler`, `ImageUploadResult`).
- Add `ImageUploadResult` / `ImageUploadHandler` per §3; add `onImageUpload?` to `EditorOptions`; re-export from the package entry so vue/element/host can import the types.
- Accept: types export from `@kedata-indonesia/docflow-core`; `typecheck` passes; no behavior change yet.

**A2. Carrier extension + wiring in `createTiptapEditor`.** ⇐ A1 · *layer: core*
- Files: `packages/core/src/EditorContext.ts` (new); [Editor.ts:156-202](../../packages/core/src/Editor.ts).
- Create `EditorContextExtension` (name `editorContext`) that stores `{ onImageUpload }` in `storage`. Add it to the base extension list in `createTiptapEditor` (always present, like `TextStyle`), configured from `options.onImageUpload`. Include it in the `getSchema([...])` list at [Editor.ts:186](../../packages/core/src/Editor.ts) so seeded-content schema matches the live schema.
- Accept: `editor.storage.editorContext.onImageUpload` returns the injected handler (unit test); collaboration seed-schema still round-trips.

**A3. Rewrite `insertImage` to use the port with prompt fallback.** ⇐ A2 · *layer: plugins*
- File: [image.ts](../../packages/plugins/src/image.ts).
- Delete `DEFAULT_IMAGE_SRC`. New command logic: if `args[0].src` given → `setImage` directly (unchanged programmatic path); else read `editor.storage.editorContext?.onImageUpload` — if present, open a hidden `<input type="file" accept="image/*">`, and on selection `await onImageUpload(file)` then `setImage({ src, alt, title })`; if absent, `window.prompt('Enter image URL:')` (no default host) → `setImage`, returning `false` on cancel. Add a small `pickImageFile(): Promise<File | null>` helper (guard `typeof document`/SSR).
- Accept: with a handler, choosing a file inserts an image at the handler-returned `src` and never contacts `via.placeholder.com`; without a handler, the URL prompt still works; SSR import does not touch `document`.

**A4. Thread through the Vue layer.** ⇐ A1 · *layer: vue*
- Files: [useEditor.ts:4-12,30-51](../../packages/vue/src/composables/useEditor.ts); [DocsEditor.vue:17-44,150-173](../../packages/vue/src/components/DocsEditor.vue).
- Add `onImageUpload?: ImageUploadHandler` to `UseEditorOptions` and pass it into `createEditor`. Add the `onImageUpload` prop to `<DocsEditor>` (typed, default `undefined`) and forward it into the `useEditor({...})` call.
- Accept: `<DocsEditor :on-image-upload="fn" />` results in `editor.storage.editorContext.onImageUpload === fn`; omitting the prop preserves prompt-fallback behavior.

**A5. Expose as a Web Component property.** ⇐ A4 · *layer: element*
- File: [DocsEditorElement.ts:18-27,56-90](../../packages/element/src/DocsEditorElement.ts).
- Add a private `_onImageUpload?: ImageUploadHandler` with a getter/setter (setter re-applies `_buildProps()`, matching the `plugins` pattern); include `onImageUpload: this._onImageUpload` in `_buildProps()`. Do **not** add an observed attribute (functions can't be strings). Add a short doc comment that consumers set `el.onImageUpload = fn`.
- Accept: `document.querySelector('docs-editor').onImageUpload = fn` propagates to the inner Vue component and into editor storage.

**A6. Update image plugin tests + demo.** ⇐ A3 · *layer: plugins / demo*
- Files: [plugins.test.ts:141](../../packages/plugins/src/__tests__/plugins.test.ts); demo usage (e.g. `apps/demo/**`).
- The existing assertion `expect(editor.getHTML()).toContain('placeholder.com')` must change to reflect the new fallback (assert the prompt/programmatic `src` path instead). Add a test asserting the handler path calls `onImageUpload` and inserts its `src`. Optionally wire a trivial local `onImageUpload` (e.g. `URL.createObjectURL`) in the demo so the showcase demonstrates the port without a backend.
- Accept: `pnpm --filter @kedata-indonesia/docflow-plugins test:unit` passes; demo image insert works with the sample handler.

### Group B — Self-host-safe collaboration defaults

**B1. Remove public signaling defaults.** ⇐ none · *layer: core*
- File: [Collaboration.ts:57-64](../../packages/core/src/Collaboration.ts).
- Drop `wss://signaling.yjs.dev` and `wss://y-webrtc-eu.fly.dev`. When `provider === 'webrtc'` and `options.signaling` is falsy/empty, default to `['ws://localhost:4444']` and emit a one-time `console.warn`: webrtc without explicit `signaling` is local-only; production self-host should supply its own signaling server or use `provider: 'websocket'`. Leave the websocket path (throws on missing `websocketUrl`) unchanged.
- Accept: no public URL appears in `packages/*`; webrtc with no signaling never opens a connection to a non-localhost host (verify in unit test / network trace); websocket path unaffected.

**B2. Document websocket + own-server as the production path.** ⇐ B1 · *layer: docs*
- Files: [CLAUDE.md:70](../../CLAUDE.md) (collaboration invariant), `docs/LIBRARY_CONTRACT.md` (the `collaboration` port entry from Phase 0), collab-relevant `README`/deployment notes.
- State: `provider: 'websocket'` + a self-hosted `websocketUrl` is the recommended production topology (no external calls); `provider: 'webrtc'` requires a self-hosted signaling server for cross-network sync and is intended for local/demo use.
- Accept: docs describe the production path and the webrtc caveat; matches code behavior from B1.

**B3. Verify demo still syncs without public servers.** ⇐ B1 · *layer: demo*
- Confirm the demo's collaboration path either targets the dev websocket server (`provider: 'websocket'`) or relies on same-browser `BroadcastChannel` for its multi-tab showcase; adjust demo config if it implicitly depended on public signaling.
- Accept: two tabs of the demo on one machine converge with **no** request to `signaling.yjs.dev` / `y-webrtc-eu.fly.dev` in the network tab.

### Group C — Audit `packages/*` for external URLs / backend assumptions

> Audit performed 2026-07-17 (grep for `http(s)://`, `wss?://`, `/api/`, `fetch(`, `import.meta.env`, `localStorage`). Findings and dispositions below.

**C1. Flag the hardcoded AI backend route (defer fix to Phase 7).** ⇐ none · *layer: vue (flag only)*
- File: [AISidebar.vue:6,27](../../packages/vue/src/components/sidebars/AISidebar.vue) — `fetch(`${API_BASE}/api/ai/copilot`)` + `VITE_API_BASE_URL`.
- This is a genuine boundary violation (library assumes a specific server route). **Do not rewrite here** — Phase 7 replaces it with the AI provider abstraction / injected action. Record it in `docs/LIBRARY_CONTRACT.md` as a **known, tracked violation → Phase 7**.
- Accept: violation documented with its owning phase; no silent acceptance.

**C2. Decide on library-owned `localStorage` persistence.** ⇐ none · *layer: vue*
- File: [DocsEditor.vue:171,392](../../packages/vue/src/components/DocsEditor.vue) — auto-saves doc JSON to `localStorage['docs-editor-current-doc']`.
- The library deciding *where* to persist violates the boundary (persistence is the host's job via `onUpdate`). **Recommended (in-scope, cheap):** remove the `localStorage.setItem` writes from the component; the host already receives every change via `emit('update:modelValue')` / `onUpdate` and can persist as it wishes; move the convenience localStorage save into `apps/demo` if the showcase wants it. Keep the `savingStatus` UI state. If deferring, flag it in the contract instead.
- Accept: `<DocsEditor>` performs no `localStorage` document writes (theme prefs in `useTheme` are fine); demo still shows a saved indicator; if deferred, documented as tracked.

**C3. Confirm remaining prompts are acceptable fallbacks.** ⇐ none · *layer: plugins/vue*
- Files: [link.ts:21](../../packages/plugins/src/link.ts), [BubbleMenu.vue:73](../../packages/vue/src/components/BubbleMenu.vue), image prompt (now the A3 fallback).
- `window.prompt('…','https://')` for link/image URLs is a UI fallback, not a backend assumption; the `'https://'` seed is a placeholder string, not an external call. **Keep as-is;** note in the audit that these are intentional no-backend fallbacks.
- Accept: audit records these as acceptable; no external network implication.

**C4. Record the audit + refresh the contract.** ⇐ A1–A5, B1, C1–C3 · *layer: docs*
- Files: `docs/LIBRARY_CONTRACT.md` (Phase 0 doc), [CLAUDE.md](../../CLAUDE.md).
- Add `onImageUpload(file) => Promise<{ src }>` to the injection-points list with its type; update the collaboration entry (B2); list C1/C2 dispositions. Re-run the grep and assert `packages/*` contains no external `http(s)`/`wss` host except localhost defaults.
- Accept: contract lists every port with types; grep for public hosts in `packages/*` returns nothing.

### Group D — Verification

**D1. Unit tests.** ⇐ A2, A3, B1
- core: `editor.storage.editorContext.onImageUpload` carries the handler; seed-schema still round-trips with the extra extension.
- plugins: `insertImage` handler path (mock `onImageUpload` + file pick) inserts returned `src`; no-handler path prompts; no `placeholder.com` in output.
- collaboration: webrtc without signaling produces localhost-only signaling and logs the warning; websocket still throws on missing `websocketUrl`.

**D2. E2E / manual (acceptance gate).** ⇐ all
- File: `e2e/library-injection.spec.ts` (new) or manual checklist.
  - **Zero external calls:** editor configured with `provider: 'websocket'` (local server) + a local `onImageUpload` → record network; assert **no** requests leave the host (no `via.placeholder.com`, no public signaling, no `/api/ai/copilot` unless AI used).
  - **Handler wins, prompt falls back:** image insert with a handler uploads via the handler; with none, the URL prompt inserts.
  - **Threads through element:** setting `el.onImageUpload` on the Web Component reaches the editor.
  - **Demo works with defaults:** demo runs, image insert works, collab tabs converge, no public hosts contacted.
- Accept: all pass; `pnpm lint && pnpm typecheck && pnpm test:unit` green for `core`, `plugins`, `vue`, `element`.

---

## 5. Sequencing

```
A1 ─► A2 ─► A3 ─► A6
  │          ▲
  └─► A4 ─► A5
              (A4/A5 also ⇐ A1 for the type)
B1 ─► B2
B1 ─► B3
C1, C2, C3  (independent) ─┐
A*, B1, C1-3 ──────────────┴─► C4 (contract/audit record)
A2,A3,B1 ─► D1 ;  everything ─► D2
```

Workstreams **A and B are independent** and can run in parallel. Land **A1→A3 + B1** first (the two actual boundary fixes), then thread the outer layers (A4/A5) and docs (B2/C4), then the audit dispositions (C1–C3). Do C4 last so the contract reflects final code.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Async upload vs. sync command contract** — `insertImage` must return `boolean` but upload is a Promise | Command returns `true` after starting the flow; insertion happens in the resolved promise (§2 decision 2). Keep programmatic `{ src }` path fully synchronous. Cover both paths in D1. |
| **Removing webrtc public defaults breaks demo cross-tab sync** | Same-browser tabs sync via `BroadcastChannel` regardless of signaling; localhost default retained; demo can target the dev websocket server (B3). Warn, don't throw, so defaults still run. |
| **Element can't pass a function via attribute** | Expose `onImageUpload` as a JS property with a setter that re-applies props (A5), mirroring the existing `plugins` pattern; never an observed attribute. |
| **Extra `editorContext` extension changes the collab seed schema** | Include it in the `getSchema([...])` list used for `prosemirrorJSONToYXmlFragment` seeding ([Editor.ts:186](../../packages/core/src/Editor.ts)); assert round-trip in D1 (this is the schema-parity trap Phase 1 also flagged). |
| **Type export churn breaks host imports** | Re-export `ImageUploadHandler`/`ImageUploadResult` from each package entry (core → vue → element) so hosts import from any layer; typecheck all four packages. |
| **Over-reach: fixing AI/storage here** | C1 (AI route) and the actual upload backend are explicitly out of scope (Phase 7 / Phase 4); Phase 2 only adds the *port* and flags the rest. |

## 7. Out of Scope (this phase)

- **The upload storage backend** — object storage (MinIO/S3) + the endpoint the host's `onImageUpload` calls is **Phase 4**. Phase 2 only defines and threads the port; the demo may use a trivial `URL.createObjectURL` handler.
- **AI provider abstraction / `/api/ai/copilot` rewrite** — **Phase 7**. Audited and flagged here (C1), not fixed.
- **`apps/web` split and moving demo-only conveniences into it** — **Phase 3**.
- **Self-hosted signaling server packaging** — deployment concern for **Phase 8**; Phase 2 only documents the requirement.
- **Server-side collaboration persistence** — **Phase 1** (independent, parallel).
