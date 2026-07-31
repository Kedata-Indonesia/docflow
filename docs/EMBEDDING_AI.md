# Embedding AI — Host App Guide

> How to wire AI into an app that embeds `@docflow/vue` (or `@docflow/core`).
> Architecture: [`plans/PLUGGABLE_AI_PROVIDER.md`](plans/PLUGGABLE_AI_PROVIDER.md).
> Operator guide (our SaaS / self-hosted deployment): [`SELF_HOSTED_AI.md`](SELF_HOSTED_AI.md).

The library is a **thin transport**. It knows one interface — `AIProvider`,
prompt in / event stream out — and nothing else: no URLs, no keys, no agent
features. Your host app owns the transport.

## 1. Minimal setup (≤ 5 lines)

```ts
import { createEditor, openaiCompatibleProvider, toAIStreamFn } from '@kedata-indonesia/docflow-vue'

const editor = createEditor({
  target: document.querySelector('#editor')!,
  aiStream: toAIStreamFn(
    openaiCompatibleProvider({
      baseUrl: 'https://your-llm.example.com/v1',
      auth: { type: 'bearer', apiKey: 'sk-...' },
      model: 'your-model',
    }),
  ),
})
```

With `aiStream` injected, the AI sidebar and inline transforms (rewrite,
summarize, /ai generate, …) just work. Without it, AI UI stays inert.

`auth` variants: `{ type: 'bearer', apiKey }` ·
`{ type: 'header', name, value }` · `{ type: 'none' }`.

## 2. Where config lives: `KeyStorage`

Hardcoding works for a demo; real apps want the URL/key stored somewhere.
The library ships three reference implementations — or write your own:

```ts
import { localStorageKeyStorage, httpKeyStorage, memoryKeyStorage } from '@kedata-indonesia/docflow-vue'

localStorageKeyStorage()                    // browser-persisted (embedded apps)
httpKeyStorage({ getUrl, setUrl, deleteUrl }) // your backend holds it
memoryKeyStorage()                          // tests / SSR
```

Typical boot flow (mirror of our SaaS `aiProviderBootstrap.ts`):

```ts
const cfg = await storage.get()
const aiStream = cfg ? toAIStreamFn(openaiCompatibleProvider(cfg)) : undefined
```

Rebuild and re-inject when the config changes (the editor reads the port
from `editor.storage.editorContext.aiStream` — assignable at runtime).

## 3. CORS (the one caveat)

The browser calls the LLM directly, so the endpoint must allow your origin.
Ollama: `OLLAMA_ORIGINS`. Hosted providers without browser CORS (OpenAI):
put a thin proxy on your backend and point `baseUrl` at it. Recipe + matrix:
[`AI_PROVIDERS.md`](AI_PROVIDERS.md). We deliberately do **not** ship a CORS
wrapper — your backend is your CORS layer (plan §7 decision 4).

## 4. Custom providers (agents, RAG, tool calling)

Anything beyond one-shot completion lives in your codebase, behind the same
interface:

```ts
import type { AIProvider, StreamEvent } from '@kedata-indonesia/docflow-vue'

class MyAgentProvider implements AIProvider {
  async *complete(req: { system?: string; prompt: string; signal?: AbortSignal }): AsyncIterable<StreamEvent> {
    // call your LangGraph / CrewAI / in-process agent, then:
    yield { type: 'delta', text: '…' }
    yield { type: 'done' }
    // or: yield { type: 'error', error }
  }
}

createEditor({ aiStream: toAIStreamFn(new MyAgentProvider()) })
```

## 5. RAG-cited drafting: the `aiDraft` port

The AI sidebar's "Draft with citations" action uses a separate, opt-in port:

```ts
createEditor({ aiDraft: myDraftFn }) // (req, signal) => AsyncIterable<AIDraftEvent>
```

`AIDraftEvent` streams text with `[n]` markers and a terminal `done` event
carrying a `{ ref, sourceId, label }` citation table; the library maps
markers to citation nodes in ONE ProseMirror transaction. Our SaaS
implementation is `POST /api/ai-extensions/draft` (vector search must stay
server-side); embedded consumers typically back `aiDraft` with their own
corpus + retrieval. The port is disabled when not injected.

## 6. Rules recap

- The library never names a URL or holds a key — you inject both.
- Cancellation: pass the request's `AbortSignal` through; closing the stream
  early aborts the in-flight fetch (no wasted tokens).
- No agent orchestration / structured outputs / token metering in v1 — wrap
  them in your provider.
