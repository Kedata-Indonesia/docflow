# Library Contract — DocsEditor

**Status:** Living document · **Owner:** Kedata Indonesia · **Last updated:** 2026-07-19

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
| `collaboration` | `CollaborationOptions` — see field table below | `EditorOptions` — [Editor.ts:29](../packages/core/src/Editor.ts); interface — [Collaboration.ts:15-23](../packages/core/src/Collaboration.ts) | Supply the full collaboration configuration: room id, transport provider, signaling/websocket endpoints, user identity, and awareness callback. The library never picks endpoints on its own (deviation #3 excepted, §5). |

**`CollaborationOptions` fields** ([Collaboration.ts:15-23](../packages/core/src/Collaboration.ts)):

| Field | Type | Notes |
|-------|------|-------|
| `room` | `string` | Required. Room/document identifier. |
| `provider` | `'webrtc' \| 'websocket'` | Optional. `webrtc` = zero-config P2P; `websocket` = production path via own server. |
| `websocketUrl` | `string` | Required when `provider === 'websocket'` (throws otherwise). |
| `signaling` | `string[]` | Optional webrtc signaling servers. **Known deviation #3:** currently defaults to public servers. |
| `user` | `{ name: string; color: string }` | Required. Identity shown to collaborators. |
| `onAwarenessChange` | `(states: AwarenessState[]) => void` | Optional presence/cursor callback. |
| `initialStorageState` | `Uint8Array` | Optional Yjs state to seed the room (e.g. from host persistence). |

> **Seeding rule (Phase 1):** in collab mode the `content` option is **not**
> auto-seeded into the room — an unguarded local seed races with other clients
> and duplicates the document. Hosts seed via `initialStorageState` or a guarded
> server flow (`POST /api/collab/seed` in `apps/server`).

### 2.2 Planned ports (catalogued, not yet implemented)

| Port | Planned signature | Phase | Replaces |
|------|-------------------|-------|----------|
| `onImageUpload` | `(file: File) => Promise<{ src: string }>` | [Phase 2](plans/phase-2-library-injection-points.md) | The `via.placeholder.com` hardcode + `window.prompt` fallback in [image.ts:5,15-20](../packages/plugins/src/image.ts) (deviation #2). |
| Export hooks | TBD in Phase 5 design | [Phase 5](plans/phase-5-export-pdf-docx.md) | Host-side export wiring; today only the `export` emit exists (§2.3). |

### 2.3 Related host-interaction surface (not backend ports)

These props/emits wire the host app into editor chrome but carry **no backend concern**;
they are listed here so reviewers don't mistake them for leaks:

- `export` emit — [DocsEditor.vue:67](../packages/vue/src/components/DocsEditor.vue):
  `export: [format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf']`.
  The host (or the component's built-in print path for PDF) produces the file.
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

---

## 4. Rules for Library Authors

**Deny-list for `packages/*`:**

1. ❌ No imports from `apps/*` (relative paths or workspace package names
   `@kedata-indonesia/docflow-server` / `@kedata-indonesia/docflow-demo`).
   → *Enforced by ESLint `no-restricted-imports`, currently `warn` (§5).*
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

Current violations of this contract, each with an owning phase that will remove it.
Phase 0 **documents and traps** these; it deliberately does not fix them.

| # | Deviation | Location | Class | Owning phase | Remediation |
|---|-----------|----------|-------|--------------|-------------|
| 1 | `AISidebar.vue` fetches the AI backend directly | [AISidebar.vue:7,30](../packages/vue/src/components/sidebars/AISidebar.vue) — `fetch(\`${API_BASE}/api/ai/copilot\`)` | Direct backend call (rule 3) | [Phase 7](plans/phase-7-ai-assistance.md) | Move AI behind a host-injected provider/port; delete the in-library `fetch`. |
| 2 | Image plugin hardcodes a placeholder URL and falls back to `window.prompt` | [image.ts:5,15-20](../packages/plugins/src/image.ts) | Hardcoded external URL / storage assumption (rule 4) | [Phase 2](plans/phase-2-library-injection-points.md) | Replace with the `onImageUpload` port (§2.2); URL prompt becomes an explicit fallback only. |
| 3 | webrtc signaling defaults to public servers (`wss://signaling.yjs.dev`, `wss://y-webrtc-eu.fly.dev`) | [Collaboration.ts:57-64](../packages/core/src/Collaboration.ts) | External-network assumption (rule 4) | [Phase 2](plans/phase-2-library-injection-points.md) | Require explicit signaling config; document websocket + own server as the production path. |
| 4 | Document draft autosave to `localStorage` (`docs-editor-current-doc`) | [DocsEditor.vue:205](../packages/vue/src/components/DocsEditor.vue), [:449](../packages/vue/src/components/DocsEditor.vue) | Document persistence in the library (rule 5) | [Phase 3](plans/phase-3-apps-web-split.md) | Move draft persistence to the host app (`apps/web`); library keeps emitting `update:modelValue` only. |

> Deviation #4 was found during Phase 0 verification (2026-07-19). The theme/locale
> `localStorage` uses in `useTheme.ts` / `useLocale.ts` are **not** deviations — they are
> presentation preferences, allowed by the rule-5 exception in §4.

### 5.1 Guardrail & escalation path

The ESLint guardrail in [.eslintrc.cjs](../.eslintrc.cjs) (override scoped to
`packages/**/*.{ts,vue}`, built-in `no-restricted-imports`, zero new dependencies) ships as
**`warn`** — it is a regression trap for future PRs, not a fixer of today's tree.

- **Coverage:** import boundaries only (rules 1–2). String-based backend calls
  (`fetch('/api/*')`, rule 3) are not import statements and stay review-gated; a custom AST
  rule is out of scope.
- **Escalation trigger:** once Phase 7 lands and deviation #1 is removed, flip the rule from
  `'warn'` to `'error'` — the only edit needed is the severity string in `.eslintrc.cjs`.
- **Baseline:** as of 2026-07-19 the boundary holds structurally —
  `grep -rn "apps/" packages --include=*.ts --include=*.vue` returns no imports, and
  `pnpm lint` emits no `no-restricted-imports` warnings.
