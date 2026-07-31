# AI Providers — Compatibility Matrix

> **Architecture:** pluggable AI provider (issue #119,
> [`plans/PLUGGABLE_AI_PROVIDER.md`](plans/PLUGGABLE_AI_PROVIDER.md)).
> LLM completions go **browser-direct**: the host app injects an
> `openaiCompatibleProvider` (or our SaaS web app builds one from the tenant's
> AI Settings config) and the library streams from it. The server only stores
> the tenant config — it never sees completion traffic.
>
> **What this is:** a contract — the browser-side provider's SSE parsing,
> auth headers, and abort semantics are asserted by unit tests
> ([`packages/core/src/ai/__tests__/openaiCompatibleProvider.test.ts`](../packages/core/src/ai/__tests__/openaiCompatibleProvider.test.ts)).
>
> **What this is NOT:** an exhaustive vendor list. The provider speaks the
> **OpenAI `/chat/completions` streaming protocol** — any endpoint that
> follows it works, even if not listed below.

---

## 1. The one knob that matters: CORS

Because the browser calls the LLM directly, the endpoint must answer CORS
preflight for the web origin. This is the #1 setup failure.

| Endpoint | Browser-direct OK? | What to do |
|----------|--------------------|------------|
| Ollama (local/self-host) | ✅ with config | Set `OLLAMA_ORIGINS=https://your-docflow-host` (or `*` in dev) |
| vLLM / LM Studio | ✅ usually | Check the server/gateway CORS settings |
| OpenAI API | ❌ | No browser CORS headers — put a thin same-origin proxy in front (see §3) |
| OpenRouter / gateways | ⚠️ varies | Test with the AI Settings "Test connection" button |

The "Test connection" button probes `GET {baseUrl}/models` **from the
server**, so it cannot detect browser-side CORS failures — a config can show
"verified" and still fail in the browser. If the sidebar errors on first use
while Test connection passed, suspect CORS.

## 2. Provider matrix

| Provider | Base URL | Auth | Notes |
|----------|----------|------|-------|
| **OpenAI** | `https://api.openai.com/v1` | bearer `sk-...` | Canonical reference (`[DONE]` sentinel). Needs a proxy for browser use (CORS). |
| **DeepSeek** | `https://api.deepseek.com/v1` | bearer | `finish_reason` arrives in the last chunk; we end on `[DONE]` **or** stream end — both handled. |
| **Ollama** | `http://<host>:11434/v1` | none | Keyless. Set `OLLAMA_ORIGINS`. Model e.g. `qwen2.5:14b`. |
| **vLLM** | `http://<host>:8000/v1` | none / bearer | Same shape as OpenAI. |
| **LM Studio** | `http://<host>:1234/v1` | none | Same shape as Ollama. |
| **OpenRouter** | `https://openrouter.ai/api/v1` | bearer | Gateway; prepends routed model id to chunks — harmless. |
| **Anthropic Claude** | — | — | No native OpenAI-shaped endpoint for chat; use a gateway (e.g. LiteLLM) or write a custom `AIProvider` class. |

> Errors: non-2xx responses surface as `{ type: 'error' }` stream events with
> the status code (and up to 200 chars of the upstream body) — the sidebar
> shows them as a failed turn.

## 3. The CORS proxy recipe (embedded/self-hosted)

When the LLM endpoint can't send CORS headers, proxy it same-origin. Minimal
Node example (any framework works):

```ts
// GET/POST /llm/* → https://api.openai.com/*
app.use('/llm', async (req, res) => {
  const upstream = await fetch(`https://api.openai.com${req.url}`, {
    method: req.method,
    headers: { Authorization: `Bearer ${process.env.OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
  })
  res.status(upstream.status)
  upstream.body?.pipeTo(new WritableStream({ write: (c) => res.write(c), close: () => res.end() }))
})
```

Point AI Settings (or your host's `openaiCompatibleProvider`) at
`/llm/v1` with auth `none` — the proxy holds the key. Note this reintroduces
a server hop **by your choice**, on your infrastructure; the library doesn't
require it.

## 4. Beyond prompt-in/tokens-out

Agent orchestration, tool calling, multi-turn memory, RAG — deliberately out
of the library's scope. Wrap your agent backend as a custom `AIProvider`
(`complete(req) → AsyncIterable<StreamEvent>`) and inject it via
`toAIStreamFn(...)` exactly like the default provider. See
[`EMBEDDING_AI.md`](EMBEDDING_AI.md) §4.
