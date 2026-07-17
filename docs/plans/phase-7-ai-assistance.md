# Phase 7 — AI Assistance (pluggable LLM) · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 7 · **Priority:** P1 (headline feature) · **Last updated:** 2026-07-17

> **Goal:** AI writing help — inline transforms, generation at cursor, doc-aware chat, and
> cited RAG drafting — with the LLM provider chosen **per deployment** by env config
> (Claude API *or* a self-hosted OpenAI-compatible endpoint), **no code change**. The editor
> never calls an LLM directly: editor → server → LLM. Every AI edit is applied as a
> **ProseMirror transaction** so it flows through Yjs like a human edit. The **library**
> exposes AI *actions* (a new `aiPlugin`); the **app** supplies the *provider*.

---

## 1. Current State (what we're replacing)

AI today is a **UI-only stub with no backend**. [AISidebar.vue](../../packages/vue/src/components/sidebars/AISidebar.vue)
POSTs to a route that does not exist, and every shape decision it makes is one we must reverse.

| Where | What it does | File |
|-------|--------------|------|
| Sidebar submit | `fetch(`${API_BASE}/api/ai/copilot`, { method: 'POST' })` | [AISidebar.vue:27-35](../../packages/vue/src/components/sidebars/AISidebar.vue) |
| Server mounts | `documents`, `collab`, `users` only — **no `/api/ai`** | [index.ts:76-78](../../apps/server/src/index.ts) |
| Route dir | `auth.ts`, `collab.ts`, `documents.ts`, `users.ts` — **no `ai.ts`** | [apps/server/src/routes/](../../apps/server/src/routes/) |
| Response read | `const data = await response.json()` (single blob) | [AISidebar.vue:36-41](../../packages/vue/src/components/sidebars/AISidebar.vue) |
| Request body | `content: props.documentContent` (whole doc, every call) | [AISidebar.vue:30-34,8-10](../../packages/vue/src/components/sidebars/AISidebar.vue) |
| Apply result | `emit('insert', aiResult.value)` → host inserts plain text | [AISidebar.vue:58-63](../../packages/vue/src/components/sidebars/AISidebar.vue) |

**The route is missing.** [index.ts](../../apps/server/src/index.ts) mounts `documents`/`collab`/`users`
([:76-78](../../apps/server/src/index.ts)) and nothing under `/api/ai`, so every sidebar call
404s. The stub has never worked end-to-end.

**The stub's four shape problems (treat as a clean slate, per the roadmap):**

1. **No provider abstraction.** The endpoint name (`/api/ai/copilot`) and payload are hardcoded
   to one imagined backend. There is no seam to swap Claude ↔ local, which is the *whole point*
   of Phase 7 (data privacy is configurable per customer).
2. **Non-streaming.** `await response.json()` ([:36](../../packages/vue/src/components/sidebars/AISidebar.vue))
   blocks on the full completion — no token streaming, poor UX, and long generations risk HTTP timeouts.
3. **Sends the whole document every call** (`content: props.documentContent`,
   [:32](../../packages/vue/src/components/sidebars/AISidebar.vue)). Cost scales with doc size; leaks
   more content than needed; ignores selection/cursor scope.
4. **Inserts plain text, bypassing the transaction model.** `emit('insert', text)`
   ([:58-63](../../packages/vue/src/components/sidebars/AISidebar.vue)) hands a raw string to the host.
   That is **not** a ProseMirror transaction — in a collaborative room it does not flow through
   Yjs correctly and can diverge. This is the non-negotiable we must fix.

**Key existing infrastructure we build on:**

- **Auth middleware** exists: `requireAuth` from [middleware/auth-guard.ts](../../apps/server/src/middleware/auth-guard.ts),
  already used per-route (e.g. [collab.ts:37](../../apps/server/src/routes/collab.ts)). The AI route reuses it.
- **Rate limiting** exists: `apiLimiter`/`authLimiter` in [rate-limiter.ts](../../apps/server/src/middleware/rate-limiter.ts)
  (both `express-rate-limit`, env-tunable). We add a dedicated `aiLimiter`.
- **Config is env-driven** ([config.ts](../../apps/server/src/config.ts)) — the natural home for `AI_*` vars.
- **The plugin contract** ([PluginSystem.ts](../../packages/core/src/PluginSystem.ts)): `DocsEditorPlugin`
  contributes `tiptapExtensions`, `toolbar`, `slashCommands`, `commands`, `hooks`; `createActionMap`
  resolves toolbar/slash actions. Existing plugins (e.g. [link.ts](../../packages/plugins/src/link.ts))
  are the pattern for a new `aiPlugin`.
- **Menu surfaces** exist: [BubbleMenu.vue](../../packages/vue/src/components/BubbleMenu.vue) (selection actions)
  and [SlashMenu.vue](../../packages/vue/src/components/SlashMenu.vue) (`/` commands) — the hosts for 7B and 7C.

---

## 2. Target Architecture

```
  ┌────────────────────────── LIBRARY (packages/*) ───────────────────────────┐
  │  aiPlugin (new)                                                            │
  │   • bubble-menu actions (7B)   • /ai ghost text (7C)   • chat actions (7D) │
  │   • applies results as ProseMirror TRANSACTIONS ──► y-prosemirror ► Y.Doc  │
  │   • NEVER imports a URL / fetch — calls an injected transport:            │
  │        aiStream(req, signal) : AsyncIterable<string>                       │
  └───────────────────────────────┬───────────────────────────────────────────┘
                                   │  (app supplies aiStream)
  ┌───────────────────────────────▼──────────── APP (apps/web, apps/server) ──┐
  │  browser ──POST /api/ai/*  (SSE)──►  apps/server/src/routes/ai.ts          │
  │                                       • requireAuth  • aiLimiter           │
  │                                       • scoped context assembly (NOT doc)  │
  │                                       • getProvider() from env config      │
  │                                              │                             │
  │                                   AIProvider │ stream() / complete()       │
  │                          ┌───────────────────┴───────────────────┐        │
  │                          ▼                                        ▼        │
  │              ClaudeAdapter (@anthropic-ai/sdk)      OpenAICompatibleAdapter │
  │              default · needs internet · data        Ollama / vLLM / LM     │
  │              leaves premises                         Studio · self-hosted  │
  │              claude-sonnet-5 (workhorse)             OpenAI-compat /v1/chat │
  │              claude-haiku-4-5 (fast) ·               /completions · local  │
  │              claude-opus-4-8 (heavy)                 model · no data egress │
  └────────────────────────────────────────────────────────────────────────────┘

  RAG PATH (7E, needs Phase 6):
  browser ──POST /api/ai/draft──► ai.ts ──► RAGService
        embed(query) ─► VectorStore.query(k) ─► retrieve Source snapshots (Phase 6 ref library)
        ─► build grounded prompt ─► AIProvider.stream() ─► answer + {sourceId, locator} spans
        ─► client inserts Phase 6 citation nodes as transactions
```

**Design decisions:**

1. **Editor → server → LLM, always.** The browser never holds an API key and never talks to an
   LLM. This keeps keys server-side, enables the provider swap, and makes auth + rate limiting +
   RAG possible. This is a non-negotiable.
2. **One provider abstraction, two adapters.** `AIProvider` (`stream()`/`complete()`). A native
   **Claude adapter** (`@anthropic-ai/sdk`) is the default/best-quality path; **one OpenAI-compatible
   adapter** covers Ollama, vLLM, LM Studio *and* hosted OpenAI via `AI_BASE_URL`. Selection is
   pure config (`AI_PROVIDER`) — switching Claude ↔ local Ollama is an env change, no code edit.
3. **Data privacy is configurable per customer.** With the OpenAI-compatible adapter pointed at a
   local endpoint, no document content leaves the network. Prompt logging is off by default and
   env-gated (`AI_LOG_PROMPTS`).
4. **AI edits are ProseMirror transactions, never raw text.** The library applies every accept as
   a `tr` dispatched through the editor, so `y-prosemirror` propagates it to the `Y.Doc` exactly
   like a human keystroke. This is the fix for stub problem #4 and the core correctness guarantee.
5. **Streaming is decoration-only until accept.** Streamed tokens render as **ProseMirror
   decorations** (ghost text / preview overlay), *not* as doc mutations. Only on **accept** do we
   dispatch a single transaction with the final text. Streaming intermediate transactions into a
   collaborative Yjs doc would flood the CRDT with churn and race other editors — decorate, then
   commit once.
6. **Scoped context assembly, server-side.** The server sends the **selection + bounded surrounding
   text** (and, for RAG, retrieved source snippets), never the whole document. This fixes stub
   problem #3 and bounds cost.
7. **The library is provider-agnostic via injection.** Mirroring the Phase 2 `onImageUpload` pattern,
   the `aiPlugin` receives an injected `aiStream` transport. The library never names an endpoint;
   the app wires `aiStream` to `/api/ai/*` + SSE parsing. A change respects the boundary: it touches
   the library (actions) *or* the app (transport + server) — rarely both.

---

## 3. Data Model / Interfaces

### Server: provider abstraction ([apps/server/src/ai/types.ts](../../apps/server/src/ai/types.ts), new)

```ts
type AIRole = 'system' | 'user' | 'assistant'
interface AIMessage { role: AIRole; content: string }

interface AICompletionRequest {
  system?: string
  messages: AIMessage[]
  maxTokens: number
  modelTier?: 'fast' | 'default' | 'heavy'   // maps to AI_MODEL / fast / heavy
  // NOTE: no temperature/top_p for the Claude adapter — removed (400) on
  // claude-sonnet-5 / claude-opus-4-8. Steer via prompt. The OpenAI-compatible
  // adapter may pass temperature through for local models.
}

type AIStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage?: AIUsage; stopReason?: string }
  | { type: 'error'; message: string }

interface AIProvider {
  stream(req: AICompletionRequest, signal: AbortSignal): AsyncIterable<AIStreamEvent>
  complete(req: AICompletionRequest, signal: AbortSignal): Promise<{ text: string; usage?: AIUsage }>
}
```

### Server: config (extends [config.ts](../../apps/server/src/config.ts))

```ts
ai: {
  provider: process.env.AI_PROVIDER ?? 'claude',        // 'claude' | 'openai-compatible'
  baseUrl: process.env.AI_BASE_URL ?? '',               // e.g. http://ollama:11434/v1
  model: process.env.AI_MODEL ?? 'claude-sonnet-5',     // workhorse default
  fastModel: process.env.AI_FAST_MODEL ?? 'claude-haiku-4-5-20251001',
  heavyModel: process.env.AI_HEAVY_MODEL ?? 'claude-opus-4-8',
  apiKey: process.env.AI_API_KEY ?? '',                 // unused for keyless local endpoints
  maxTokens: parseInt(process.env.AI_MAX_TOKENS ?? '2048', 10),
  logPrompts: process.env.AI_LOG_PROMPTS === 'true',    // privacy: off by default
  embeddings: {                                          // 7E
    provider: process.env.AI_EMBED_PROVIDER ?? 'claude',
    model: process.env.AI_EMBED_MODEL ?? '',
    baseUrl: process.env.AI_EMBED_BASE_URL ?? '',
  },
}
```

### Server → browser: SSE event shape (the wire protocol `ai.ts` emits)

```
event: delta   data: {"text":"partial tokens"}
event: delta   data: {"text":"more tokens"}
event: done    data: {"usage":{"inputTokens":123,"outputTokens":45},"stopReason":"end_turn"}
event: error   data: {"message":"provider unavailable"}
```

Content-Type `text/event-stream`, `Connection: keep-alive`, flush per delta. Client aborts via
`AbortController`; server passes the `signal` to the provider to cancel the upstream call.

### Library: injected transport + action request ([packages/core/src/ai/types.ts](../../packages/core/src/ai/types.ts), new)

```ts
type AIAction =
  | 'rewrite' | 'summarize' | 'grammar' | 'tone' | 'translate' | 'expand' | 'shorten'  // 7B
  | 'generate'                                                                          // 7C
  | 'chat'                                                                              // 7D
  | 'draft'                                                                             // 7E

interface AIActionRequest {
  action: AIAction
  selection?: string                       // selected text (7B)
  context?: { before: string; after: string }   // bounded surrounding text
  prompt?: string                          // user instruction (/ai, chat, tone target, target lang)
  documentId?: string                      // for doc-aware chat / RAG scoping
  options?: Record<string, unknown>
}

// The app implements this and injects it; the library never knows the URL.
type AIStreamFn = (req: AIActionRequest, signal: AbortSignal) => AsyncIterable<string>
```

### Server: embeddings + vector store (7E, [apps/server/src/ai/rag/types.ts](../../apps/server/src/ai/rag/types.ts), new)

```ts
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>   // Claude or local, mirrors AI_PROVIDER split
}

interface VectorRecord { id: string; vector: number[]; metadata: { sourceId: string; docId?: string; chunk: string } }

interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>
  query(vector: number[], k: number, filter?: { docId?: string; ownerId: string }): Promise<Array<{ id: string; score: number; metadata: VectorRecord['metadata'] }>>
  deleteByDoc(docId: string): Promise<void>
}
```

Default implementation: **Mongo Atlas Vector Search** (keeps the one-datastore-for-on-prem
preference — Phase 1 already made Mongo the single store). See Risks §6 for the vector-store choice.

---

## 4. Task Breakdown

Grouped 7A–7E. Each task lists **layer** (library / server / app), files, work, acceptance, deps (`⇐`).

### Group 7A — Provider abstraction + server AI route · *can start after Phase 2*

**7A-1. Add the Claude SDK + provider deps.** (server) ⇐ none
- File: [apps/server/package.json](../../apps/server/package.json)
- Add `"@anthropic-ai/sdk"` to `dependencies`; `pnpm install`. (The OpenAI-compatible adapter uses
  `fetch` against `${AI_BASE_URL}/chat/completions` — no extra dep required, but `openai` may be
  added if preferred.)
- Accept: `import Anthropic from '@anthropic-ai/sdk'` resolves in the server build.

**7A-2. AI config block.** (server) ⇐ none
- File: [apps/server/src/config.ts](../../apps/server/src/config.ts) — add the `ai:` block from §3;
  extend `validateConfig()` to warn when `provider === 'claude'` but `apiKey` is empty, and when
  `provider === 'openai-compatible'` but `baseUrl` is empty.
- Accept: booting with `AI_PROVIDER=openai-compatible AI_BASE_URL=…` logs the active provider/model.

**7A-3. `AIProvider` interface + adapters.** (server) ⇐ 7A-1, 7A-2
- Files: `apps/server/src/ai/types.ts` (new, §3); `apps/server/src/ai/claudeAdapter.ts` (new);
  `apps/server/src/ai/openaiCompatibleAdapter.ts` (new); `apps/server/src/ai/index.ts` (new, `getProvider()`).
  - **ClaudeAdapter**: `client.messages.stream({ model, max_tokens, system, messages })`; map
    `content_block_delta`/`text_delta` → `{type:'delta'}`, `message_delta`/`message_stop` → `{type:'done'}`.
    Do **not** send `temperature`/`top_p` (rejected on `claude-sonnet-5`/`claude-opus-4-8`). `modelTier`
    selects `model`/`fastModel`/`heavyModel`. Use `.stream()` (never non-streaming) so long outputs
    don't hit HTTP timeouts.
  - **OpenAICompatibleAdapter**: POST `${baseUrl}/chat/completions` with `stream:true`, `Authorization:
    Bearer ${apiKey}` (omit if empty for keyless local); parse OpenAI SSE `choices[].delta.content`
    → `{type:'delta'}`, `[DONE]` → `{type:'done'}`.
  - `getProvider()` returns the adapter per `config.ai.provider` (memoized).
- Accept: unit tests — a fake Claude stream and a fake OpenAI SSE stream both normalize to the same
  `AIStreamEvent` sequence; `getProvider()` returns the right adapter for each `AI_PROVIDER`.

**7A-4. Scoped context assembly + prompt builder.** (server) ⇐ 7A-3
- File: `apps/server/src/ai/context.ts` (new)
- `buildMessages(req: AIActionRequest): AICompletionRequest` — assembles a per-action system prompt +
  user message from **selection + bounded `context.before/after`** (cap each side, e.g. ~1–2k chars),
  **never the whole document**. Per-action templates for rewrite/summarize/grammar/tone/translate/
  expand-shorten/generate/chat/draft.
- Accept: unit test asserts assembled payload size is bounded and excludes untruncated full-doc content.

**7A-5. The SSE route.** (server) ⇐ 7A-3, 7A-4
- Files: `apps/server/src/routes/ai.ts` (new); mount in [index.ts:76-78](../../apps/server/src/index.ts)
  as `app.use('/api/ai', aiRoutes)`.
- `POST /api/ai/complete` (used by 7B/7C/7D): `requireAuth` + `aiLimiter`; body is `AIActionRequest`;
  `buildMessages` → `getProvider().stream(...)`; pipe events as the §3 SSE protocol; wire an
  `AbortController` to `req.on('close')` so client disconnect cancels the upstream call.
- Accept: authenticated `curl -N` to `/api/ai/complete` streams `event: delta` chunks then `event: done`;
  unauthenticated returns 401; exceeding `aiLimiter` returns 429.

**7A-6. Dedicated AI rate limiter.** (server) ⇐ none
- File: [apps/server/src/middleware/rate-limiter.ts](../../apps/server/src/middleware/rate-limiter.ts)
- Add `aiLimiter` (env `RATE_LIMIT_AI_MAX`, tighter window than `apiLimiter`) — hosted-API cost/abuse control.
- Accept: `aiLimiter` returns 429 with `retryAfter` past the cap.

**7A-7. App-side transport (`aiStream`).** (app) ⇐ 7A-5
- Files: `apps/web/src/ai/aiStream.ts` (new; and `apps/demo` may stub/disable it). Implements
  `AIStreamFn`: POSTs `AIActionRequest` to `${API_BASE}/api/ai/complete`, reads the SSE body, yields
  `delta.text` strings, stops on `done`, throws on `error`.
- Accept: app-level test drives `aiStream` against a mock SSE server and receives ordered token strings.

### Group 7B — Inline transforms (library `aiPlugin`) · *highest value / lowest complexity*

**7B-1. `aiPlugin` scaffold + injected transport.** (library) ⇐ 7A-7
- Files: `packages/plugins/src/ai.ts` (new, `aiPlugin`); export from
  [packages/plugins/src/index.ts](../../packages/plugins/src/index.ts); `packages/core/src/ai/types.ts`
  (new, §3). Thread an `aiStream?: AIStreamFn` option through core → vue (mirror the Phase 2
  `onImageUpload` injection). `aiPlugin` follows the [DocsEditorPlugin](../../packages/core/src/PluginSystem.ts)
  contract; because its actions are **async/streaming**, they are not plain synchronous `commands` —
  the plugin ships a ProseMirror plugin holding preview state + commands `acceptAI`/`rejectAI`.
- Accept: `aiPlugin` registers; with no `aiStream` injected, AI actions are inert (no crash), like
  `onImageUpload`'s prompt fallback.

**7B-2. Bubble-menu selection actions.** (library) ⇐ 7B-1
- File: [packages/vue/src/components/BubbleMenu.vue](../../packages/vue/src/components/BubbleMenu.vue)
- Add an "AI" entry to the hardcoded `items` ([:44-53](../../packages/vue/src/components/BubbleMenu.vue))
  opening a submenu: **rewrite / summarize / fix grammar / change tone / translate / expand / shorten**.
  On click, capture the current selection range + bounded surrounding text, call `aiStream({action,
  selection, context})`, and render streamed tokens as a **replacement preview decoration** over the
  selection.
- Accept: selecting text → "improve" streams a preview overlay; nothing is written to the doc yet.

**7B-3. Accept/reject as a transaction.** (library) ⇐ 7B-2
- File: `packages/plugins/src/ai.ts`
- `acceptAI` dispatches a single `tr` replacing the selection range with the final text; `rejectAI`
  clears the decoration. **No intermediate doc mutation during streaming.**
- Accept (the gate): in a **collaborative** websocket room, two clients A+B; A selects and accepts a
  rewrite → B sees the replaced text converge (flows through Yjs); no divergence, no duplicate insert.

### Group 7C — Generative at cursor (slash `/ai`) · streamed ghost text

**7C-1. `/ai` slash command.** (library) ⇐ 7B-1
- Files: `packages/plugins/src/ai.ts` (add `slashCommands: [{ name: 'AI', command: 'aiGenerate' }]`);
  [packages/vue/src/components/SlashMenu.vue](../../packages/vue/src/components/SlashMenu.vue) already
  filters/executes `props.commands` ([:29-60](../../packages/vue/src/components/SlashMenu.vue)) — hook
  `aiGenerate` to open a small prompt input at the cursor.
- Accept: typing `/ai` shows the command; selecting it prompts for an instruction.

**7C-2. Streamed ghost text at cursor.** (library) ⇐ 7C-1
- File: `packages/plugins/src/ai.ts` — a ProseMirror plugin renders streamed tokens as a **ghost-text
  widget decoration** at the cursor (dim, inline), fed by `aiStream({action:'generate', prompt,
  context})`. Doc is untouched while streaming.
- Accept: `/ai write an intro` streams grey ghost text after the cursor.

**7C-3. Accept/reject ghost text.** (library) ⇐ 7C-2
- File: `packages/plugins/src/ai.ts` — Tab/Enter `acceptAI` inserts the accumulated text as one
  transaction at the cursor; Esc `rejectAI` discards. Reuses 7B-3's accept path.
- Accept: accept inserts real text (converges over Yjs in a collab room); reject leaves the doc unchanged.

### Group 7D — Chat sidebar (doc-aware) · replaces the stub

**7D-1. Rewrite `AISidebar.vue` to stream + doc-aware.** (library) ⇐ 7A-7, 7B-1
- File: [packages/vue/src/components/sidebars/AISidebar.vue](../../packages/vue/src/components/sidebars/AISidebar.vue)
- Replace the whole stub: delete the `/api/ai/copilot` fetch ([:22-49](../../packages/vue/src/components/sidebars/AISidebar.vue)),
  the `await response.json()` non-streaming read, the `documentContent` whole-doc prop, and the
  `emit('insert', plainText)` path ([:58-63](../../packages/vue/src/components/sidebars/AISidebar.vue)).
  Use `aiStream({action:'chat', prompt, documentId})`; render streamed assistant tokens; maintain a
  turn history. Context is assembled **server-side** (scoped), not by shipping the doc.
- Accept: chat streams token-by-token; the quick-action macros (summarize / fix grammar / continue)
  route through `aiStream`, not the dead route.

**7D-2. Agentic edits from chat as transactions.** (library) ⇐ 7D-1, 7B-3
- File: `AISidebar.vue` + `packages/plugins/src/ai.ts`
- When the user asks the chat to edit the doc ("make paragraph 2 formal"), apply the result via the
  `acceptAI` transaction path — **never** the old plain-text insert. Show a preview + confirm.
- Accept: a chat-driven edit lands as a transaction and converges in a collab room; no raw insert remains.

### Group 7E — Cited AI drafting (RAG) · *needs Phase 6*

**7E-1. Embeddings provider.** (server) ⇐ 7A-3, Phase 6
- Files: `apps/server/src/ai/rag/embeddings.ts` (new) implementing `EmbeddingProvider` (§3), with
  Claude and local (OpenAI-compatible) backends selected by `AI_EMBED_PROVIDER` — same privacy split
  as the completion provider.
- Accept: `embed(['x','y'])` returns two vectors of consistent dimension per configured backend.

**7E-2. Vector store over the Phase 6 reference library + doc.** (server) ⇐ 7E-1, Phase 6
- Files: `apps/server/src/ai/rag/vectorStore.ts` (new) implementing `VectorStore` (§3). Default:
  **Mongo Atlas Vector Search** (one-datastore preference). Index the Phase 6 `Source` records
  (CSL-JSON snapshots) + document chunks; embed on source create/update and on doc save (debounced).
- Accept: querying with a topic vector returns the expected `sourceId`s ranked by score; owner-scoped
  filter enforced.

**7E-3. `POST /api/ai/draft` (grounded generation).** (server) ⇐ 7E-2, 7A-5
- File: [apps/server/src/routes/ai.ts](../../apps/server/src/routes/ai.ts)
- `requireAuth` + `aiLimiter`; `embed(query)` → `VectorStore.query(k)` → assemble a grounded prompt
  from retrieved `Source` snapshots + bounded doc context → stream the answer. Return, alongside text
  deltas, the `{sourceId, locator}` spans the model grounded on.
- Accept: a drafting request streams an answer whose cited spans reference real `Source` ids from the
  reference library.

**7E-4. Insert Phase 6 citations as transactions.** (library) ⇐ 7E-3, 6A
- Files: `packages/plugins/src/ai.ts` — on accept, insert the drafted text **plus Phase 6 citation
  nodes** (`{ sourceId, locator }`, from [Phase 6](../ENHANCEMENT_ROADMAP.md)'s `citationPlugin`) as a
  single transaction, so citeproc-js renders them per the active style.
- Accept: RAG draft is inserted with live, style-rendered citations that resolve to reference-library
  sources; converges in a collab room.

### Group 7F — Config, docs & tests

**7F-1. Env + deployment docs.** (app) ⇐ 7A-2
- Files: `docker/server.env.example`, `.env.docker.example` — document `AI_PROVIDER`, `AI_BASE_URL`,
  `AI_MODEL`, `AI_FAST_MODEL`, `AI_HEAVY_MODEL`, `AI_API_KEY`, `AI_MAX_TOKENS`, `AI_LOG_PROMPTS`,
  `RATE_LIMIT_AI_MAX`, and the `AI_EMBED_*` vars; document Claude vs local-only modes.
- Accept: examples describe both a Claude deployment and a privacy-strict local (Ollama) deployment.

**7F-2. CLAUDE.md note.** (app) ⇐ 7A-5
- File: [CLAUDE.md](../../CLAUDE.md) — add an "AI assistance" note: editor→server→LLM, `aiPlugin`
  (library) vs provider (app), transactions-not-raw-text, config-driven provider.
- Accept: doc matches the boundary reality.

**7F-3. Tests.** ⇐ all
- Unit (server): adapter normalization (7A-3), context bounding (7A-4), route auth/limits (7A-5/7A-6),
  RAG retrieval (7E-2).
- E2E (the acceptance gate): (a) **provider swap** — same flow works with `AI_PROVIDER=claude` and a
  local Ollama endpoint, env-only; (b) **collab safety** — selection "improve" streams a replacement
  applied as a transaction inside a two-client websocket room with no divergence; (c) `/ai` generates
  at cursor with streaming accept/reject; (d) **privacy** — with local provider, no doc content leaves
  the network; (e) **RAG** cites real reference-library sources.
- Accept: all pass in CI.

---

## 5. Sequencing

```
Phase 2 ─► 7A-1 ─┐
        ─► 7A-2 ─┼─► 7A-3 ─► 7A-4 ─► 7A-5 ─► 7A-7 ─┬─► 7B-1 ─► 7B-2 ─► 7B-3
                 │            7A-6 ─────────► 7A-5   │
                 │                                   ├─► 7C-1 ─► 7C-2 ─► 7C-3
                 │                                   └─► 7D-1 ─► 7D-2
Phase 6 ─────────────────────────► 7E-1 ─► 7E-2 ─► 7E-3 ─► 7E-4
7A-2 ─► 7F-1 ;  7A-5 ─► 7F-2 ;  everything ─► 7F-3
```

Land **7A → 7B (through 7B-3 collab gate)** first — that proves the whole spine end-to-end (route +
provider + streaming + transaction-through-Yjs). Then 7C and 7D reuse the same accept/transaction
path. **7A can start right after Phase 2**; **7E needs Phase 6** (reference library + citation nodes)
and layers on last. Do not build 7D-2 agentic edits until 7B-3's transaction path is proven.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Streaming tokens mutating the collaborative doc mid-generation** (churns the CRDT, races other editors) | Stream to **decorations only**; commit **one transaction on accept** (§2 decision 5, 7B-2/7B-3). **Validate with the two-client collab E2E — this is the #1 risk**, the direct fix for stub problem #4. |
| **AI edit bypasses Yjs and diverges** (the stub's `emit('insert', text)`) | All accepts go through `acceptAI` → a ProseMirror `tr` → `y-prosemirror` (7B-3); grep to ensure no raw-text insert path remains after 7D-1. |
| **Prompt injection** (malicious doc/source text steering the model, or exfiltrating context) | Server-side context assembly with clear role separation; keep untrusted doc/source text in user-role content, instructions in system; never execute model output as commands; RAG retrieval is owner-scoped (7E-2). |
| **Token cost / quota abuse on hosted (API) deployments** | Dedicated `aiLimiter` (7A-6); scoped context (never whole doc, 7A-4); `AI_MAX_TOKENS` cap; model tiering (`claude-haiku-4-5-20251001` for cheap actions, `claude-sonnet-5` default, `claude-opus-4-8` only for heavy). Per-user quotas noted as future work. |
| **Local model quality below Claude** (privacy-strict installs) | Provider abstraction makes quality a deployment choice, not a code choice; document a recommended local model/GPU baseline in 7F-1; keep prompts model-agnostic; allow per-action tiering so cheap local models handle simple transforms. |
| **Vector-store choice must fit one-datastore on-prem** | Default **Mongo Atlas Vector Search** — Phase 1 already made Mongo the single authoritative store, so no new datastore for on-prem. `pgvector` (needs Postgres, a second datastore) and a **self-hosted store** (Qdrant/Milvus — extra ops surface) are documented alternatives behind the `VectorStore` interface but not the default. Resolve finally in Phase 8 packaging. |
| **Provider outage / cancellation leaks** | Client `AbortController` wired to `req.on('close')` cancels the upstream call (7A-5); adapter errors surface as `event: error` (§3), not a hung stream. |
| **Data privacy leak via logs** | `AI_LOG_PROMPTS` off by default (7A-2); with local provider + logging off, no content leaves the network — asserted by the privacy E2E (7F-3d). |

## 7. Out of Scope (this phase)

- **Per-user token quotas / billing** beyond rate limiting (roadmap open question — future).
- **Fine-tuning or hosting our own model weights** — we consume Claude or a customer-supplied local endpoint.
- **Multi-provider fan-out / automatic fallback between providers** — one provider per deployment.
- **AI-generated images / diagrams** — text only.
- **Agentic multi-tool workflows** (browsing, code execution) — chat is doc-grounded Q&A + edits, not a general agent.
- **Air-gapped install** — on-prem is self-hosted *with internet* (locked decision); the local path serves privacy-strict, not fully offline, customers.
- **Local AI hardware provisioning / GPU sizing guidance** beyond a documented baseline — belongs to Phase 8 packaging.
