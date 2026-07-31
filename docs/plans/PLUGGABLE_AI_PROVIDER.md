# Pluggable AI Provider

## 1. Goal

Make the AI sidebar usable by both our SaaS web app and consumers who embed `@docflow/vue` in their own app, without forcing either side to talk to a specific backend. The library becomes the AI boundary; everything above it (UI) talks to one interface, everything below it (transport) is consumer choice.

We ship a thin transport: an `AIProvider` interface the library knows about, a default `openaiCompatibleProvider` implementation consumers can opt into, and a `KeyStorage` interface so consumers decide where the URL/key live. Anything beyond prompt-in / tokens-out (agent orchestration, RAG, tool calling, multi-turn memory, structured outputs, citation streams) is out of scope. Consumers wire whatever they want behind their endpoint.

This plan **supersedes** Phase 7's "browser → server → LLM" proxy direction for the SaaS path ([phase-7-ai-assistance.md §2](phase-7-ai-assistance.md)) and **closes library-contract deviation #1** ([LIBRARY_CONTRACT.md §5](../LIBRARY_CONTRACT.md)) — `AISidebar.vue` already uses host-injected `aiStream` / `aiDraft` ports, so this work retires the server proxy in favor of direct-from-browser calls configured by the host.

## 2. Why we are changing direction

Phase 7 (server proxy) was correct when "internal LLM" meant *our* deployment. Now that embedded consumers must bring their own LLM, the server proxy in `apps/server` becomes:

- **Wrong-shaped for embedded apps.** They have no `apps/server`. They must point the library at their own backend, agent SDK, or vLLM directly.
- **Wrong-shaped for SaaS tenants who want their own key.** Proxying a tenant's OpenAI key through our infra adds cost, latency, and a SOC2 question we don't need on the table.
- **Wrong-shaped for hot-reload.** `getProvider()` reads `process.env` once at boot. A settings page that requires a redeploy is not a settings page.

The fix is to **push the transport into the host boundary** — same pattern as `onImageUpload` ([LIBRARY_CONTRACT.md §2.1](../LIBRARY_CONTRACT.md)). The library gets a port; the host plugs in whatever it wants.

## 3. System architecture

### 3.1 Current state (Phase 7 as-shipped)

```text
┌─────────────────────────────────┐
│  Embedded consumer app          │
│  ┌───────────────────────────┐  │
│  │  Their host app           │  │
│  │  ┌─────────────────────┐  │  │
│  │  │ @docflow/vue        │  │  │   ← library, in-process
│  │  │  └─ AISidebar.vue   │  │  │      reads editorContext.aiStream
│  │  └─────────────────────┘  │  │      port (Phase 7)
│  └───────────────────────────┘  │
│                                  │  ← consumer has no way to
│                                  │    inject aiStream today
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  Our SaaS web app               │
│  ┌───────────────────────────┐  │
│  │ apps/web (Vue)            │  │
│  │  └─ AISidebar.vue ──┐    │  │
│  └─────────────────────┼────┘  │
│                        │       │
│  ┌─────────────────────▼────┐  │
│  │ apps/server (Hono)       │  │   ← our proxy, holds the key
│  │  ├─ /api/ai/complete ───►│  │
│  │  └─ /api/ai/draft ─────►│──┼──► tenant LLM (or ours)
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

**Problems:**

1. Embedded apps cannot inject an `aiStream` transport — `aiPlugin` types live in `packages/plugins/src/ai.ts` but the host wiring example only exists in `apps/web`.
2. SaaS tenants cannot rotate keys without a redeploy. The proxy makes ops, security, and per-tenant customization all harder.
3. The proxy adds a hop that exists only because the browser *cannot* be trusted with a key. With per-tenant (not per-deployment) auth, the browser can hold its own.

### 3.2 Target state

The library becomes the AI boundary. The host (whatever it is — `apps/web`, a consumer's Vue app, an Electron shell) wires in a transport once. The sidebar reads it via the same `editorContext` port pattern already used today.

```text
┌──────────────────────────────────────────────────────────┐
│  Embedded consumer app                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Their host app                                     │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │ @docflow/vue                                 │  │  │
│  │  │  ├─ AISidebar.vue ─┐                         │  │  │
│  │  │  │   editorContext.aiStream                  │  │  │
│  │  │  └─ aiPlugin ───────┘  (port declaration)    │  │  │
│  │  │           ▼                                  │  │  │
│  │  │  AIProvider (interface, library owns shape)  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                       ▲                              │  │
│  │                       │ host injects via editor     │  │
│  │                       │ options (props + storage)   │  │
│  │  ┌────────────────────┴───────────────────────┐    │  │
│  │  │ Host chooses the impl:                     │    │  │
│  │  │   • openaiCompatibleProvider({...})  ←── default we ship │  │
│  │  │   • custom class (in-process agent)       │    │  │
│  │  │   • fetcher via their /api/ai proxy       │    │  │
│  │  └───────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                                  │
                                  │ (if HTTP provider)
                                  ▼
                          their LLM / agent backend
                          (out of our scope)

┌──────────────────────────────────────────────────────────┐
│  Our SaaS web app                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ apps/web (Vue)                                     │  │
│  │  ├─ AISidebar.vue ─┐                               │  │
│  │  ├─ SettingsAI.vue │                               │  │
│  │  └─ aiProviderBootstrap.ts                         │  │
│  │       │  on app boot:                              │  │
│  │       │   1. GET  /api/ai/config                   │  │
│  │       │   2. instantiate openaiCompatibleProvider  │  │
│  │       │   3. wrap as AIStreamFn                    │  │
│  │       │   4. inject into editorContext             │  │
│  │       ▼                                            │  │
│  │  AIProvider (interface)                            │  │
│  └─────────────────────┬──────────────────────────────┘  │
│                        │ browser-side fetch              │
│                        ▼                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ apps/server (Hono)                                 │  │
│  │  └─ /api/ai/config  (admin: write/read config)    │  │
│  │                                                    │  │
│  │  Persisted config:                                 │  │
│  │    /data/ai-config.json                            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Key architectural shifts

| Concern                                | Before (Phase 7)                                               | After                                                                                               |
|----------------------------------------|----------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| Who calls the LLM?                     | Always our server (apps/server)                                | Whoever owns the page (browser in both cases)                                                       |
| Where does the API key live?           | `process.env` on our server                                    | Browser-side `KeyStorage` (consumer's choice)                                                       |
| Where does the URL come from?          | `process.env` on our server                                    | Same place as the key — they are a pair                                                             |
| What does the library know about LLMs? | A function signature (`AIStreamFn`) passed via `editorContext` | Same — but the function signature becomes the **declared port** (Option), not just storage fallback |
| What is the unit of pluggability?      | Deployment env (single provider per server)                    | Per-app config, hot-reloadable, per-tenant if you want                                              |
| Where does the SaaS server fit?        | Proxies every AI call                                          | Stores the tenant's config; never sees LLM traffic                                                  |

### 3.4 Library-contract alignment

Today the library has two parallel mechanisms for AI:

- `AIStreamFn` / `AIDraftFn` types in [`packages/core/src/ai/types.ts`](../../packages/core/src/ai/types.ts) and [`packages/plugins/src/ai.ts`](../../packages/plugins/src/ai.ts).
- `AISidebar.vue` accepts `aiStream` as a prop AND falls back to `editor.storage.editorContext.aiStream` ([AISidebar.vue:42-45, 74-77](../../packages/vue/src/components/sidebars/AISidebar.vue)).

That's a partial port — it works for `apps/web`, but a consumer reading [`LIBRARY_CONTRACT.md §2.1`](../LIBRARY_CONTRACT.md) will not find `aiStream` documented as a port. **This plan promotes it to a real port** alongside `onImageUpload`, with a single canonical declaration on `EditorOptions`:

```ts
interface EditorOptions {
  // ...existing ports...
  /** AI completion transport. Stream of tokens for one prompt. */
  aiStream?: AIStreamFn
  /** AI draft transport (RAG-grounded; emits citations). */
  aiDraft?: AIDraftFn
}
```

The `editorContext` storage mechanism stays — it's how the prop is carried into extensions that don't have prop access — but the prop becomes the documented entry point. Updating [`LIBRARY_CONTRACT.md §2.1`](../LIBRARY_CONTRACT.md) is part of this work (closes deviation #1).

## 4. Interface boundaries

These three exports are the entire public surface of this feature.

### 4.1 `AIProvider` — the library's only knowledge of LLMs

Lives in [`packages/core/src/ai/provider.ts`](../../packages/core/src/ai/) (new).

```ts
type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; stopReason?: string }
  | { type: 'error'; error: Error }

interface AIProvider {
  complete(req: {
    system?: string
    prompt: string
    signal?: AbortSignal
  }): AsyncIterable<StreamEvent>
}
```

The library imports *only* this type. It does not import any implementation.

### 4.2 Port types — what `EditorOptions` declares

Lives in [`packages/core/src/ai/types.ts`](../../packages/core/src/ai/types.ts) (existing file, edited).

```ts
// Already defined in Phase 7; we add a factory shape so hosts can
// hand us either a function OR a provider object.
export type AIProviderFactory = (config: {
  signal?: AbortSignal
}) => AIProvider

export type AIStreamFn = (
  req: { system?: string; prompt: string; signal?: AbortSignal }
) => AsyncIterable<StreamEvent>

// Adapter: any AIProvider satisfies AIStreamFn via .complete(req).
// This lets hosts pass either shape and the library accepts both.
```

The adapter means `AISidebar.vue` keeps working unchanged whether the host passes a function (today) or a provider object (new option).

### 4.3 `openaiCompatibleProvider(config)` — the one default impl we ship

Lives in [`packages/core/src/ai/openaiCompatibleProvider.ts`](../../packages/core/src/ai/) (new).

```ts
export function openaiCompatibleProvider(config: {
  baseUrl: string
  auth: Auth
  model: string
  systemPrompt?: string
}): AIProvider
```

- OpenAI-shaped `/chat/completions` SSE.
- Three auth types: bearer, custom header, none.
- Abort signal. Cancellation-safe (closing the iterator aborts the in-flight `fetch`).
- `systemPrompt` is applied per-call by the provider so hosts don't have to repeat it.
- `model` is the only knob — we don't expose temperature/maxTokens in v1. If consumers ask, add as optional fields later.

### 4.4 `KeyStorage` — how the provider remembers its config

Lives in [`packages/core/src/ai/keyStorage.ts`](../../packages/core/src/ai/) (new).

```ts
interface KeyStorage {
  get(): Promise<AIConfig | null>
  set(value: AIConfig): Promise<void>
  clear(): Promise<void>
}

type AIConfig = {
  baseUrl: string
  auth:
    | { type: 'bearer'; apiKey: string }
    | { type: 'header'; name: string; value: string }
    | { type: 'none' }
  model: string
}
```

Reference impls ship in the same file:

- `memoryKeyStorage()` — for tests and SSR
- `localStorageKeyStorage()` — for embedded apps that want browser-side persistence
- `httpKeyStorage({ getUrl, setUrl, deleteUrl })` — for SaaS web app and any embedded app that wants the key on its server

The HTTP variant is what closes the loop with `apps/web`'s settings page: the host's `httpKeyStorage` calls our `/api/ai/config` server route, which persists to disk.

## 5. Consequences

### 5.1 Things that get easier

- **Embedded apps with no backend at all** can use the library by passing `apiKey` directly to `openaiCompatibleProvider` wrapped in an `AIStreamFn`. No `KeyStorage` needed.
- **Embedded apps with a backend** can either (a) point at their own `/api/ai` proxy using our HTTP provider, or (b) write a custom `AIProvider` class that calls their in-process agent SDK directly.
- **Our SaaS web app's config moves** from `process.env` + redeploy to a settings page + click. Hot-reloadable. The `/api/ai/config` admin endpoint validates by making a one-shot test call before persisting (mirrors the "Test connection" UX).
- **Adding a new provider** (Gemini, Anthropic-direct, Bedrock) becomes a one-file change in the library — no server work, no env wiring. The HTTP shape covers them all.
- **Library contract closes** — `AISidebar.vue`'s fallback to `editorContext.aiStream` becomes a documented port, deviation #1 in [`LIBRARY_CONTRACT.md §5`](../LIBRARY_CONTRACT.md) is resolved.

### 5.2 Things that get harder

- **No central rate limiting for the SaaS web app.** `aiLimiter` in [`apps/server/src/routes/ai.ts`](../../apps/server/src/routes/ai.ts) goes away — the browser now calls the LLM directly. Mitigation: ship a `TokenBucketProvider` decorator consumers can wrap; the SaaS web app wraps its bootstrap with one.
- **No server-side prompt logging.** `AI_LOG_PROMPTS` becomes meaningless for completion. If ops need logs, they wrap their own provider or stand up their own proxy.
- **No CORS story for embedded apps pointing at cross-origin LLMs.** Consumers handle this on their backend or pick a same-origin proxy. Document it in the embedding guide.
- **Settings page is admin-only.** Misconfig means the AI sidebar breaks for everyone. The settings page must have a "Test connection" button that fires one cheap request before saving.
- **Draft action (RAG-cited)** becomes harder for SaaS users — it relied on `apps/server` doing the vector search. Options below in §7.

### 5.3 Things we explicitly do not do

- **No agent orchestration, tool calling, RAG, or citation streaming in the library.** Consumers wrap their agent as an `AIProvider` and emit `delta` events.
- **No per-user BYOK in our SaaS web app.** Tenant admin sets it. Per-user is a separate, later feature.
- **No Gemini/Anthropic-direct adapters.** The HTTP provider covers all of them via OpenAI-compatible endpoints or a consumer-written thin proxy. Add later if SaaS customers actually need them.
- **No change to ProseMirror transaction safety.** The streaming-safety invariant from Phase 7 holds: only meta-only decorations during the stream, exactly one dispatch on accept.

## 6. Business consequences

This is the part the rest of the plan does not say out loud, so it is worth being explicit.

### 6.1 What we are committing to

- **The library is a thin transport, not an AI product.** Consumers who want agents, RAG, or tool calling build them outside the library. We do not chase that roadmap unless a paid feature requires it.
- **Per-tenant AI config is a SaaS feature.** Tenant admins set it via the settings page. Per-user BYOK is not on this roadmap.
- **The browser holds the key.** This means:
  - We are not in the LLM proxy business anymore. We do not bill for tokens, we do not store completions, we do not enforce quotas server-side.
  - **Good news:** removes the SOC2 scope of "we hold customer LLM keys." The browser is the customer's boundary.
  - **Caution:** any prompt-logging feature in the SaaS app now requires explicit consent UI, because the prompt is leaving the customer's browser for the customer's chosen LLM — which may be a third-party. This is fine for OpenAI/Anthropic, awkward for Ollama-on-prem.

### 6.2 What we are explicitly deferring

- **Multi-turn chat memory.** Consumers handle it in their `AIProvider` impl. The library stays one-shot.
- **Streaming structured outputs (JSON schema, function calls).** Not in v1 of the interface.
- **Citation streaming for SaaS.** See §7.
- **Token usage metering for billing.** Out of scope until/unless we ship a paid AI tier.

### 6.3 What this unblocks

- **Self-hosted enterprise sales motion.** Sales can now say "your data stays in your browser, your keys never leave your network" — a real story, not marketing copy. Phase 7's server-proxy model could not say that.
- **Partner integrations.** Companies that already have an agent backend (LangGraph, CrewAI, custom) can wire it as a `class implements AIProvider`. Integration time goes from "wait for us to add an adapter" to "30 lines of code."
- **The library becomes embeddable in regulated environments** (healthcare, legal, gov) without us having to build compliance certifications on the AI path.

### 6.4 What this kills

- **Phase 7's draft-with-citations action as a SaaS-shipped feature.** The library surface stays one-shot, so the SaaS web app's "Draft with citations" action either (a) moves to an opt-in SaaS extension that calls our still-existing RAG endpoint, or (b) dies. See §7.
- **Server-side token metering and audit logging as automatic features.** Consumers who want them build them.

## 7. Decisions (locked)

The five open questions below were resolved in product review. Each lists the chosen option and the reason locked.

1. **Draft (RAG-cited) action — chosen: C. Keep as an opt-in library port.**
   - Closes Phase 7E's existing investment (the `aiDraft` port + RAG route are already shipped).
   - Lets regulated buyers (healthcare / legal / government) plug their own corpus + RAG backend as `aiDraft`, which is the actual differentiator vs. TipTap + a sidebar.
   - Avoids the forever-maintained split code path that option B creates.
   - Document the contract tightly: `aiDraft`'s signature constrains it to (request, citation stream) so users can't repurpose it as a generic "shove the doc into the LLM" button.

2. **Settings page auth — chosen: B. New `requireAdmin` middleware.**
   - Option A (any authenticated user can write) fails any buyer SOC2 review on the first pass: tenant users controlling outbound network destinations is an instant mark.
   - Option C (per-tenant admin role) is the same line as B but requires a tenant-role primitive `better-auth` doesn't have today — scope creep.
   - Aligns with the buyer's own vocabulary: Notion, Slack, etc. draw the line the same way.
   - Concretely: "tenant admins control tenant-wide config; users control their own sessions."

3. **Hot reload semantics — chosen: A. In-memory + file write; readers re-read on every call.**
   - The config file is small, written rarely (a few times a week per tenant admin), and read on app boot. One extra `readFile` per request is below the noise floor.
   - Option B's pubsub/`storage`-event channel adds moving parts and new failure modes (what if the event drops mid-save?) for no measurable win.
   - The file **is** the state — debuggable with `cat`, fixable with `vi`, backupable like any other config. Option B makes all of that harder.
   - The only reason to revisit B is if writes become hot (per-user BYOK, live model switching) — not in this scope.

4. **CORS for embedded cross-origin LLMs — chosen: document only.**
   - No `withCors()` wrapper in `packages/core`. Consumers who ask are confusing "library" with "BFF" — the correct answer is to point at their backend / proxy / vLLM config.
   - `docs/EMBEDDING_AI.md` ships a one-paragraph note + a small proxy code sample. That's the whole surface area.

5. **`/api/ai/config` test-call shape — chosen: A. `GET {baseUrl}/models`, with graceful degradation.**
   - Catches the two most common misconfigs (wrong URL string, key not valid for this host) without spending tokens.
   - Supported by Ollama, vLLM, and most OpenAI-compatible gateways.
   - **Caveat (locked in implementation):** `GET /models` is not standardized across all OpenAI-compatible providers. If the test request fails with anything other than a clean HTTP 200, the settings page falls back to "shape validated only; will surface a runtime error on first AI use." Do not promise more than the wire gives you.

## 8. File plan

### 8.1 Library — new files (`packages/`)

| File                                                              | Purpose                                                                                                                                                                     |
|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `packages/core/src/ai/provider.ts`                                | `AIProvider` interface, `StreamEvent` type. Library's only LLM knowledge.                                                                                                   |
| `packages/core/src/ai/openaiCompatibleProvider.ts`                | Default `AIProvider` impl. OpenAI-shaped `/chat/completions` SSE. Three auth types. Abort-safe.                                                                             |
| `packages/core/src/ai/keyStorage.ts`                              | `KeyStorage` interface + `AIConfig`/`Auth` types + `memoryKeyStorage` / `localStorageKeyStorage` / `httpKeyStorage` reference impls.                                        |
| `packages/core/src/ai/index.ts`                                   | Barrel export.                                                                                                                                                              |
| `packages/core/src/ai/__tests__/openaiCompatibleProvider.test.ts` | Mocked fetch: auth header variants, SSE parsing, abort signal, error events.                                                                                                |
| `packages/core/src/ai/__tests__/keyStorage.test.ts`               | localStorage round-trip, memory impl, http impl with mocked fetch.                                                                                                          |
| `packages/vue/src/composables/useAIProvider.ts`                   | Vue composable: read provider from `editorContext`, expose reactive `complete()` to components. Single source of truth for "which provider is the sidebar using right now." |

### 8.2 Library — edits (`packages/`)

| File                                                 | Change                                                                                                                                                                                                         |
|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `packages/core/src/Editor.ts`                        | Add `aiStream?: AIStreamFn` and `aiDraft?: AIDraftFn` to `EditorOptions`. Carry through `EditorContextExtension` into `editor.storage.editorContext.aiStream` (already done in Phase 7 — verify and document). |
| `packages/core/src/ai/types.ts`                      | Add `AIProvider` and `AIProviderFactory` types. Adapter so `AIProvider.complete` satisfies `AIStreamFn`.                                                                                                       |
| `packages/plugins/src/ai.ts`                         | No shape change; the existing `aiPlugin` keeps working because `AISidebar.vue` already reads from `editorContext`.                                                                                             |
| `packages/vue/src/components/sidebars/AISidebar.vue` | No behavior change. The prop/fallback already does the right thing. Add a JSDoc pointing at `LIBRARY_CONTRACT.md`.                                                                                             |
| `packages/vue/src/index.ts`                          | Export `openaiCompatibleProvider`, `KeyStorage` reference impls, `useAIProvider` so consumers can pick without reaching into internals.                                                                        |
| `docs/LIBRARY_CONTRACT.md`                           | **§2.1**: add `aiStream` and `aiDraft` to the port catalogue. **§3**: add threading maps. **§5**: mark deviation #1 resolved. Update last-updated date.                                                        |

### 8.3 Server (`apps/server`)

| File                                                    | Status         | Purpose                                                                                                                                                                                          |
|---------------------------------------------------------|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `apps/server/src/routes/aiConfig.ts`                    | NEW            | `GET /api/ai/config` (read), `POST /api/ai/config` (write + `?dryRun=true` validates via `GET {baseUrl}/models`), `DELETE /api/ai/config` (clear). Admin-gated. Persists to `${AI_CONFIG_PATH}`. |
| `apps/server/src/routes/ai.ts`                          | DELETE         | `/complete` and `/draft` go away.                                                                                                                                                                |
| `apps/server/src/ai/index.ts`                           | DELETE         | `getProvider()` no longer needed.                                                                                                                                                                |
| `apps/server/src/ai/openaiCompatibleAdapter.ts`         | DELETE         | Same reason.                                                                                                                                                                                     |
| `apps/server/src/ai/claudeAdapter.ts`                   | DELETE         | Same reason.                                                                                                                                                                                     |
| `apps/server/src/ai/rag/*`                              | KEEP or DELETE | Per §7 decision 1. If C: keep but rename to `/api/ai-extensions/draft` and gate behind feature flag.                                                                                             |
| `apps/server/src/config.ts`                             | EDIT           | Remove all `AI_*` env vars except new `AI_CONFIG_PATH` and admin auth bits. Update startup validation.                                                                                           |
| `apps/server/src/index.ts`                              | EDIT           | Mount only `/api/ai/config` (+ `/api/ai-extensions/draft` if §7 = C). Remove `aiLimiter` if no consumers left.                                                                                   |
| `apps/server/.env.example`, `docker/server.env.example` | EDIT           | Drop `AI_PROVIDER/BASE_URL/MODEL/...`. Add `AI_CONFIG_PATH=/data/ai-config.json` and admin-gating vars.                                                                                          |
| `apps/server/package.json`                              | EDIT           | Drop `@anthropic-ai/sdk` if no other consumer.                                                                                                                                                   |

### 8.4 Web app (`apps/web`)

| File                                     | Status          | Purpose                                                                                                                                                                                                                       |
|------------------------------------------|-----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `apps/web/src/pages/SettingsAI.vue`      | NEW             | Form: base URL, auth type radio (Bearer / Custom header / None), API key field, model field, "Test connection" button (`POST /api/ai/config?dryRun=true`), save → POST.                                                       |
| `apps/web/src/router/*`                  | EDIT            | Add `/settings/ai` route, admin-only guard.                                                                                                                                                                                   |
| `apps/web/src/ai/aiStream.ts`            | KEEP or REWRITE | Per §7. If draft is C: keep. Otherwise rewrite as a thin `aiStream` wrapper around `openaiCompatibleProvider` so the bootstrap can pass it.                                                                                   |
| `apps/web/src/ai/aiDraft.ts`             | KEEP or DELETE  | Same.                                                                                                                                                                                                                         |
| `apps/web/src/ai/aiProviderBootstrap.ts` | NEW             | Bootstraps the singleton provider: on app mount, GET `/api/ai/config`, instantiate `openaiCompatibleProvider`, wrap as `AIStreamFn`, inject into `editorContext`. Reactive: re-fetches on `storage` events for embedded case. |
| `apps/web/src/main.ts`                   | EDIT            | Wire `aiProviderBootstrap` into the app boot.                                                                                                                                                                                 |

### 8.5 Docs

| File                           | Purpose                                                                                                                                                                                                                                       |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `docs/EMBEDDING_AI.md` (new)   | Embedded-app guide: minimal 5-line setup (`openaiCompatibleProvider` directly), full setup (`KeyStorage` + custom port), advanced (custom `AIProvider` class for in-process agent). Code samples for Vue, React (via Web Component), vanilla. |
| `docs/SELF_HOSTED_AI.md` (new) | Operator guide: settings page walkthrough, env vars, admin role setup, what happens if config is wrong.                                                                                                                                       |
| `docs/AI_PROVIDERS.md`         | Rewrite. Was per-provider env config; becomes a per-provider compatibility matrix for `openaiCompatibleProvider` (which base URLs, auth shapes, models work).                                                                                 |
| `docs/PRD.md`                  | Update Phase 7 status to "superseded by [this plan]."                                                                                                                                                                                         |

## 9. Order of work

1. `provider.ts` + `openaiCompatibleProvider.ts` + unit tests (parser is the only non-trivial logic).
2. `keyStorage.ts` + reference impls + unit tests.
3. `EditorOptions.aiStream` / `aiDraft` declaration + threading into `editorContext` (verify Phase 7 already did this; no-op if so).
4. Update `LIBRARY_CONTRACT.md` to add the port and resolve deviation #1.
5. Wire `useAIProvider` composable in the Vue package.
6. Ship `openaiCompatibleProvider` from `packages/vue` public exports so embedded consumers can import without reaching into internals.
7. Server `/api/ai/config` route + admin middleware.
8. `aiProviderBootstrap.ts` + `SettingsAI.vue` + admin-gated route.
9. Delete Phase 7 proxy code (`apps/server/src/ai/*`, `routes/ai.ts`, `apps/web/src/ai/aiStream.ts` / `aiDraft.ts`).
10. Update `docs/AI_PROVIDERS.md`, write `docs/EMBEDDING_AI.md`, write `docs/SELF_HOSTED_AI.md`.
11. Manual smoke: SaaS path (settings page → AI sidebar), embedded path (5-line `openaiCompatibleProvider` setup in a sample app).
12. E2E: extend `e2e/product/ai.spec.ts` with settings-page flow + embedded-style test that passes a stub provider.

## 10. Acceptance criteria

- Library builds with zero new imports from `apps/*`. `pnpm lint` shows no `no-restricted-imports` warnings.
- `LIBRARY_CONTRACT.md` deviation #1 row is marked ✅. `grep -rn "fetch.*api/ai" packages --include=*.ts --include=*.vue` returns nothing (the Phase 7 partial fix is now total).
- Embedded consumer can use AI in ≤ 5 lines of host code: `createEditor({ aiStream: openaiCompatibleProvider({ baseUrl, auth, model }).complete })`.
- SaaS admin can rotate LLM config without a redeploy. Settings page shows a "Test connection" success indicator before save.
- All existing `e2e/product/ai.spec.ts` tests still pass against the new flow.
- Typecheck + unit + e2e all green for `packages/core`, `packages/vue`, `apps/web`, `apps/server`.
