# Phase 0 — Boundary Contract & Guardrails · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 0 · **Priority:** P0 · **Last updated:** 2026-07-17

> **Goal:** make the **library/app boundary explicit and enforced** so it can't erode
> silently. The library (`packages/*`) reaches the backend only through narrow, documented
> **injection ports** (`onUpdate`, `collaboration`, future `onImageUpload`, future export
> hooks); persistence, auth, and storage stay in `apps/*`. This phase is **docs + tooling
> only** — no runtime behavior changes.

---

## 1. Current State (what we're formalizing)

The boundary rule already holds structurally — **no `packages/*` file imports from `apps/*`**
(verified: `grep -rn "apps/" packages --include=*.ts --include=*.vue` returns nothing). But
the rule is **undocumented and unenforced**, and one leak already exists. The injection ports
are real but scattered across four files with no single reference.

**The injection ports that exist today:**

| Port | Signature | Defined at | Threaded through |
|------|-----------|------------|-------------------|
| `onUpdate` | `(json: object) => void` | [EditorOptions, Editor.ts:28](../../packages/core/src/Editor.ts) | `useEditor` ([useEditor.ts:7,42](../../packages/vue/src/composables/useEditor.ts)); `DocsEditor.vue` consumes it internally and re-emits as `update:modelValue` ([DocsEditor.vue:157-172](../../packages/vue/src/components/DocsEditor.vue)) |
| `collaboration` | `CollaborationOptions` (`room`, `provider`, `websocketUrl`, `signaling?`, `user`, `onAwarenessChange?`, `initialStorageState?`) | [Editor.ts:29](../../packages/core/src/Editor.ts), [Collaboration.ts:15-23](../../packages/core/src/Collaboration.ts) | `DocsEditor.vue` prop ([:22](../../packages/vue/src/components/DocsEditor.vue)); `useEditor` ([:9,43](../../packages/vue/src/composables/useEditor.ts)); element maps `room`/`websocket-url` attrs → config ([DocsEditorElement.ts:70-82](../../packages/element/src/DocsEditorElement.ts)) |

**Ports that are missing / leaking today (the gaps this phase names, later phases fill):**

- **No `onImageUpload` port.** [image.ts:5-25](../../packages/plugins/src/image.ts) hardcodes
  `DEFAULT_IMAGE_SRC = 'https://via.placeholder.com/300x200'` and falls back to `window.prompt`
  — a storage assumption baked into the library. (Filled in Phase 2.)
- **No export hook.** `DocsEditor.vue` emits `export: [format: 'markdown' | 'html' | 'txt']`
  ([DocsEditor.vue:54](../../packages/vue/src/components/DocsEditor.vue)) but there is no
  library-side export port; PDF/DOCX has none. (Filled in Phase 5.)
- **A real leak:** [AISidebar.vue:6,27](../../packages/vue/src/components/sidebars/AISidebar.vue)
  calls `fetch(\`${API_BASE}/api/ai/copilot\`, …)` — a `packages/vue` component reaching a
  backend route directly. This is exactly the class of thing the guardrail must catch. (The
  route itself is a Phase 7 clean-slate; here we only need the guardrail to *flag* it.)
- **Unsafe collab defaults:** [Collaboration.ts:57-64](../../packages/core/src/Collaboration.ts)
  defaults webrtc signaling to public servers (`wss://signaling.yjs.dev`,
  `wss://y-webrtc-eu.fly.dev`). Not a backend *import*, but an external-network assumption the
  contract should record as a known deviation. (Fixed in Phase 2.)

**Where the rule lives today:** only as prose in the roadmap
([ENHANCEMENT_ROADMAP.md:30-37](../ENHANCEMENT_ROADMAP.md)). Neither
[CLAUDE.md](../../CLAUDE.md) nor [AGENTS.md](../../AGENTS.md) states "don't import backend into
`packages/*`", and there is no lint rule.

**Tooling baseline (what a guard would plug into):**

- Single flat ESLint config, no `overrides`, no import-restriction plugin
  ([.eslintrc.cjs](../../.eslintrc.cjs)); `eslint-plugin-import` / `eslint-plugin-boundaries`
  are **not** installed (root [package.json](../../package.json) devDeps).
- Lint command is `eslint . --ext .ts,.vue` (root [package.json](../../package.json));
  `ignorePatterns` excludes `dist/`, `build/`, `node_modules/`, `*.cjs`.
- Workspace globs are `packages/*` + `apps/*` ([pnpm-workspace.yaml](../../pnpm-workspace.yaml)).
- Path aliases map `@kedata-indonesia/docflow-*` → `packages/*/src`
  ([tsconfig.base.json:20-31](../../tsconfig.base.json)) — the only sanctioned way one package
  references another.

---

## 2. Target Architecture

```
  ┌──────────────────────── apps/* (backend concerns) ─────────────────────────┐
  │  apps/server: Mongo, better-auth, storage, collab WS, AI route              │
  │  apps/web  : dashboard, auth UI, sharing, wires ports → server              │
  │  apps/demo : thin, backend-free showcase (defaultPlugins, webrtc/local)     │
  └───────────────▲──────────────────────────────▲─────────────────────────────┘
                  │ implements ports              │ implements ports
        ┌─────────┴───────── INJECTION PORTS (the contract) ──────────┐
        │  onUpdate(json)            collaboration: CollaborationOptions│
        │  onImageUpload(file)→url   export hooks   [future]           │
        └─────────▲───────────────────────────────────────────────────┘
                  │ declares ports, never implements backend
  ┌───────────────┴──────────────── packages/* (the library) ──────────────────┐
  │  core (ports on EditorOptions)  vue (props/emits)  element (attrs)          │
  │  plugins · layout-engine                                                    │
  │  MUST NOT: import apps/*, fetch /api/*, import mongoose/express/better-auth,│
  │            hardcode external URLs/CDNs/storage                              │
  └────────────────────────────────────────────────────────────────────────────┘
        guardrail: ESLint no-restricted-imports on packages/*  (flags AISidebar leak)
        source of record: docs/LIBRARY_CONTRACT.md  +  CLAUDE.md / AGENTS.md note
```

**Design decisions:**

1. **The contract is a document, not code.** `docs/LIBRARY_CONTRACT.md` is the single reference
   listing every port with its TypeScript signature, where it's declared, and how each layer
   (core → vue → element) threads it. Later phases (2, 5) *edit this file* when they add a port
   — it is the living spec, mirroring how Phase 1 keeps [CLAUDE.md](../../CLAUDE.md) truthful.
2. **Guardrail is advisory-then-enforced, and optional.** The roadmap marks the lint guard
   "(optional)". Implement it as an ESLint `overrides` block scoped to `packages/**` using the
   **built-in** `no-restricted-imports` (zero new deps) so it can't rot the toolchain. It will
   immediately flag the known `AISidebar.vue` leak — so land it as a **warning** first
   (documented exception), not a hard `error`, to avoid turning `pnpm lint` red before Phase 7
   removes the leak. Escalate to `error` once the leak is gone.
3. **No behavioral change.** We do not touch `image.ts`, `Collaboration.ts`, or `AISidebar.vue`
   runtime code in Phase 0 — only document them as known gaps/leaks with a forward pointer to
   the phase that fixes each. This keeps Phase 0 a pure docs/tooling change with no test churn.
4. **`no-restricted-imports` over `eslint-plugin-boundaries`.** The boundaries we need
   (`apps/*`, server-only npm deps, `/api/*` via a path pattern) are expressible as restricted
   path/pattern lists. Avoid adding `eslint-plugin-import`/`-boundaries` unless a future phase
   needs richer rules — keeps the dependency surface minimal for on-prem.

---

## 3. Data Model

**N/A — docs & tooling only.** This phase adds no schema, model, table, or persisted state. Its
deliverables are one new Markdown file (`docs/LIBRARY_CONTRACT.md`), edits to two existing
Markdown files (`CLAUDE.md`, `AGENTS.md`), and an optional ESLint config change. There is no
data to model; the "model" being formalized is the **injection-port interface set** already
typed in `EditorOptions` ([Editor.ts:23-32](../../packages/core/src/Editor.ts)) and
`CollaborationOptions` ([Collaboration.ts:15-23](../../packages/core/src/Collaboration.ts)),
which §1 and the contract document rather than change.

---

## 4. Task Breakdown

Tasks are grouped; each lists files, work, and acceptance. Dependencies noted as `⇐`.

### Group A — The contract document

**A1. Author `docs/LIBRARY_CONTRACT.md`.** ⇐ none
- File: `docs/LIBRARY_CONTRACT.md` (new)
- Structure:
  1. **Principle** — quote the one architectural rule from
     [ENHANCEMENT_ROADMAP.md:30-37](../ENHANCEMENT_ROADMAP.md): the library knows nothing about
     the backend; persistence/auth/storage are the host app's job via narrow ports.
  2. **Port catalogue** — a table with one row per port: name, TypeScript signature, layer it's
     declared on, and the host-app responsibility. Cover the **existing** ports:
     - `onUpdate?: (json: object) => void` — persistence hook for single-user/non-collab docs
       ([Editor.ts:28](../../packages/core/src/Editor.ts)).
     - `collaboration?: CollaborationOptions` — provider config, full field list from
       [Collaboration.ts:15-23](../../packages/core/src/Collaboration.ts).
     - And the **planned** ports, marked `(Phase 2)` / `(Phase 5)`:
       - `onImageUpload?: (file: File) => Promise<{ src: string }>` — asset upload (Phase 2;
         replaces the [image.ts:5](../../packages/plugins/src/image.ts) hardcode).
       - export hooks — PDF/DOCX/format hooks (Phase 5; today only the
         [`export` emit, DocsEditor.vue:54](../../packages/vue/src/components/DocsEditor.vue)).
  3. **Threading map** — for each port, show core → vue → element wiring with file:line refs
     (use the §1 tables as the source).
  4. **Rules for library authors** — the deny-list mirrored in the guardrail (no `apps/*`
     imports, no `fetch('/api/*')`, no `mongoose`/`express`/`better-auth`, no hardcoded
     external URLs/CDNs) and the "add a port instead" escape hatch.
  5. **Known deviations** — table of current violations with owning phase: `AISidebar.vue`
     `/api/ai/copilot` fetch → Phase 7; `image.ts` placeholder.com → Phase 2;
     `Collaboration.ts` public signaling defaults → Phase 2.
- Accept: every existing port appears with a correct signature and a verified file:line ref;
  the three known deviations are listed with their owning phase.

**A2. Cross-link the contract.** ⇐ A1
- Files: [docs/ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) (Phase 0 "Deliverables" line
  already names `docs/LIBRARY_CONTRACT.md`), [README.md](../../README.md) if it has a docs index.
- Add a link from the roadmap Phase 0 section to the new contract; add to any docs index.
- Accept: the contract is reachable by one click from the roadmap; no broken relative links.

### Group B — Boundary note in agent/architecture docs

**B1. Add the boundary note to `CLAUDE.md`.** ⇐ none (can reference A1 once it exists)
- File: [CLAUDE.md](../../CLAUDE.md)
- In "Core design invariants" (near [:64-72](../../CLAUDE.md)), add a short invariant:
  *"Never import backend concerns into `packages/*`. Persistence/auth/storage/AI are the host
  app's job, reached only via injection ports (`onUpdate`, `collaboration`, `onImageUpload`,
  export hooks). See [docs/LIBRARY_CONTRACT.md](docs/LIBRARY_CONTRACT.md). A PR touching both
  `packages/*` and `apps/*` for one concern is a smell."*
- Accept: the note exists, links to the contract, and matches the wording style of the
  surrounding invariants.

**B2. Add the boundary note to `AGENTS.md`.** ⇐ none
- File: [AGENTS.md](../../AGENTS.md)
- Add a rule under "Orchestrator Rules" (after [:22-23](../../AGENTS.md), the single-source-of-
  truth rule): *"Respect the library boundary — no backend imports in `packages/*`; see
  `docs/LIBRARY_CONTRACT.md`."* Add a matching item to the "Verification Checklist"
  ([:29-36](../../AGENTS.md)): *"[ ] No new backend imports in `packages/*` (contract holds)."*
- Accept: both the rule and the checklist item are present and reference the contract.

### Group C — Optional lint guardrail

> Marked "(optional)" in the roadmap. It is high-value (turns the prose rule into CI) and
> low-risk (built-in rule, no new deps), so include it, but land as **warning** first because
> the known `AISidebar.vue` leak (Phase 7) would otherwise fail `pnpm lint`.

**C1. Add a `packages/**` ESLint override with `no-restricted-imports`.** ⇐ none
- File: [.eslintrc.cjs](../../.eslintrc.cjs)
- Add an `overrides` entry scoped to `files: ['packages/**/*.{ts,vue}']` with:
  ```js
  rules: {
    'no-restricted-imports': ['warn', {
      patterns: [
        { group: ['**/apps/*', '**/apps/**'], message: 'packages/* must not import from apps/*. Use an injection port — see docs/LIBRARY_CONTRACT.md.' },
        { group: ['mongoose', 'express', 'better-auth', 'better-auth/*'], message: 'Backend-only dependency is forbidden in packages/*. Move it to apps/*.' },
      ],
    }],
  }
  ```
- Note: `no-restricted-imports` covers `import`/`export from`; direct `fetch('/api/...')` string
  calls (the `AISidebar.vue` leak) are **not** import statements, so document that gap in the
  contract's "Known deviations" and rely on review for `/api/*` fetches (a custom rule is
  out of scope — see §7). Verify the rule works inside `.vue` `<script>` via the existing
  `vue-eslint-parser` setup ([.eslintrc.cjs:14-20](../../.eslintrc.cjs)).
- Accept: `pnpm lint` runs clean-or-with-expected-warnings; a deliberate
  `import x from '../../apps/server/...'` added to a scratch `packages/*` file triggers the
  restricted-import message; removing it clears it.

**C2. Record the escalation path.** ⇐ C1, A1
- File: `docs/LIBRARY_CONTRACT.md` (the "Known deviations" section from A1)
- State that the rule ships as `warn` and flips to `error` once the Phase 7 AI leak is removed;
  no code change needed beyond changing `'warn'` → `'error'`.
- Accept: the escalation trigger (Phase 7 done) and the exact edit are written down.

### Group D — Verification

**D1. Docs + lint verification.** ⇐ A1, A2, B1, B2, C1
- Run `pnpm lint` (must pass or emit only the documented `AISidebar.vue` warning).
- Manually check every relative link added in A/B resolves (roadmap→contract, CLAUDE→contract,
  AGENTS→contract).
- Re-run the boundary grep to confirm the baseline still holds:
  `grep -rn "apps/" packages --include=*.ts --include=*.vue` → only expected matches (none for
  imports).
- Accept: lint green (modulo documented warning); all links resolve; grep confirms no
  `packages/* → apps/*` imports.

---

## 5. Sequencing

```
A1 ─► A2
A1 ─► C1 ─► C2
B1 (indep)
B2 (indep)
A1, A2, B1, B2, C1 ─► D1
```

Land **A1 (the contract)** first — it is the deliverable everything else references. B1/B2 are
independent doc edits that can go in parallel. C1/C2 (the optional guard) depend on A1 only for
the cross-reference wording. D1 gates the phase. Nothing here blocks Phases 1 or 2, which the
roadmap lists as depending on Phase 0 — those phases consume the *contract*, so A1 is the true
unblocker.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Guardrail turns `pnpm lint` red** because of the existing `AISidebar.vue` `/api/ai/copilot` leak | Ship `no-restricted-imports` as `warn`, not `error` (C1); document the exception + escalation to `error` after Phase 7 (C2). |
| Contract drifts from code as later phases add ports | Make `docs/LIBRARY_CONTRACT.md` the file Phases 2 & 5 must edit when adding a port; the CLAUDE.md/AGENTS.md notes point every contributor to it (B1/B2). |
| `no-restricted-imports` doesn't catch the real leak (a `fetch('/api/*')` string, not an import) | Explicitly scope the guard to *import* boundaries; record the `fetch`-based leak class as a review-only "Known deviation" in the contract (C1 note); a custom AST rule is out of scope (§7). |
| Rule doesn't fire inside `.vue` files | Override targets `packages/**/*.{ts,vue}` and relies on the existing `vue-eslint-parser`; D1 validates with a scratch import in a `.vue` file. |
| Adding an ESLint plugin dependency bloats the on-prem footprint | Use the **built-in** `no-restricted-imports` only; no `eslint-plugin-import`/`-boundaries` added (§2, decision 4). |
| False sense of enforcement (structural rule already holds, so guard looks like a no-op) | Frame the guard as a *regression trap* for future PRs, not a fixer of today's tree; the value is preventing the next leak, stated in the contract. |

## 7. Out of Scope (this phase)

- **Fixing the leaks themselves.** Replacing `image.ts`'s placeholder default with
  `onImageUpload`, hardening `Collaboration.ts` signaling defaults, and removing the
  `AISidebar.vue` `/api/ai/copilot` fetch are **Phase 2 / Phase 7** — Phase 0 only documents
  and traps them.
- **Adding the future ports.** `onImageUpload` (Phase 2) and export hooks (Phase 5) are
  *catalogued* in the contract but not implemented here.
- **A custom AST lint rule for `fetch('/api/*')`.** Only `no-restricted-imports` (import
  boundaries) is in scope; runtime string-based backend calls are review-gated for now.
- **The `apps/web` split.** Creating the real product app and trimming `apps/demo` is Phase 3.
- **Flipping the guard to `error`.** Deferred until the last documented deviation is removed.
