# AI Providers — Compatibility Matrix

> **Phase:** 7 (AI assistance) + 8B2-r2 (provider-agnostic robustness).
> **What this is:** a contract — every provider we ship with is **asserted at the wire level** by the compat test suite ([`apps/server/src/ai/__tests__/openaiCompat.spec.ts`](../apps/server/src/ai/__tests__/openaiCompat.spec.ts)). Adding a provider to this list requires (a) a happy-path fixture + an error-path fixture, (b) a per-provider quirk note if applicable, and (c) all tests green.
>
> **What this is NOT:** an exhaustive vendor list. The adapter speaks the **OpenAI `/chat/completions` streaming protocol** — any provider that follows it works, even if not listed below. If you ship a new one, please open a PR with a fixture.

The compat tests are **unit tests** (no network, no API keys). Recorded response shapes are inlined. Each provider's `happy-path` + `error-path` fixture is what the adapter must normalize correctly to the §3 wire shape (`delta` text in order → exactly one `done` → `error` with upstream body).

---

## 1. Provider matrix

| Provider | Type | Verified | Notes |
|----------|------|----------|-------|
| **Anthropic Claude API** | First-class (`AI_PROVIDER=claude`) | ✅ live + tests | Uses `@anthropic-ai/sdk` directly. No SSE wire parsing — the SDK returns a stream of typed events. Adapter normalizes to the §3 wire shape (see `claudeAdapter.ts`). |
| **DeepSeek** | OpenAI-compatible | ✅ live + tests (`deepseek-chat`) | `finish_reason` arrives in the **last streaming chunk** (not via `[DONE]`). Adapter detects both. Errors: 400 carries `Model Not Exist`; 401 carries `Authentication Fails`. |
| **OpenAI** | OpenAI-compatible | ✅ tests (`gpt-4o-mini`) | Canonical reference. `[DONE]` after the last chunk. Errors: 429 carries `Rate limit reached for requests`. |
| **Ollama** | OpenAI-compatible (local) | ✅ tests (`llama3.1:8b`) | Some Ollama versions emit `"usage": null` in the last chunk; the adapter treats `usage: null` as missing. Local endpoint, no `Authorization` header required (set `AI_API_KEY=`). |
| **vLLM** | OpenAI-compatible (self-host) | ✅ tests (`meta-llama/Llama-3-8b`) | Same shape as OpenAI; `object: "chat.completion.chunk"`. Often deployed behind a gateway — the gateway may inject `usage`. |
| **LM Studio** | OpenAI-compatible (local) | ✅ tests (`qwen2.5-7b-instruct`) | Same shape as Ollama. Local endpoint, no auth. |
| **OpenRouter** | OpenAI-compatible (gateway) | ✅ tests (`anthropic/claude-3.5-sonnet`) | Prepends `model` (routed model id) to every chunk. `finish_reason: "stop"` (lowercase) — same as OpenAI. Errors: 402 carries `insufficient credits`. |

> **Adding a provider:** copy one of the existing fixtures in `openaiCompat.spec.ts`, change the model name + at least one delta text, add an entry to the matrix above, and ship both the test and the doc change in the same PR.

---

## 2. Configuration per provider

All providers use the same `apps/server` env surface (see [`docs/DEPLOYMENT.md` §3.4](../DEPLOYMENT.md)). The key differences are **`AI_PROVIDER`**, **`AI_BASE_URL`**, **`AI_MODEL`**, and **`AI_API_KEY`**.

### 2.1 Anthropic Claude

```env
AI_PROVIDER=claude
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-5
AI_FAST_MODEL=claude-haiku-4-5-20251001
AI_HEAVY_MODEL=claude-opus-4-8
# AI_BASE_URL not used for Claude.
```

### 2.2 DeepSeek (current prod)

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
AI_FAST_MODEL=deepseek-chat
AI_HEAVY_MODEL=deepseek-chat
AI_API_KEY=sk-...
```

### 2.3 OpenAI

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
AI_FAST_MODEL=gpt-4o-mini
AI_HEAVY_MODEL=gpt-4o
AI_API_KEY=sk-...
```

### 2.4 Ollama (local)

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://ollama:11434/v1
AI_MODEL=llama3.1:8b
AI_FAST_MODEL=llama3.1:8b
AI_HEAVY_MODEL=llama3.1:70b
AI_API_KEY=    # keyless — Ollama ignores the header when empty
```

### 2.5 vLLM (self-host)

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://<vllm-host>:8000/v1
AI_MODEL=meta-llama/Llama-3-8b
AI_API_KEY=    # keyless unless you set up a gateway auth
```

### 2.6 LM Studio (local)

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=qwen2.5-7b-instruct
AI_API_KEY=    # keyless
```

### 2.7 OpenRouter

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=anthropic/claude-3.5-sonnet
AI_FAST_MODEL=anthropic/claude-3-haiku
AI_HEAVY_MODEL=anthropic/claude-3-opus
AI_API_KEY=sk-or-...
```

---

## 3. Per-provider quirks (what the adapter handles for you)

| Provider | Quirk | How the adapter handles it |
|----------|-------|---------------------------|
| **DeepSeek** | `finish_reason` is in the last streaming chunk, not via `[DONE]`. | The parser emits `done` either way (whichever comes first) and silently absorbs a duplicate. See [`openaiCompat.spec.ts`](../apps/server/src/ai/__tests__/openaiCompat.spec.ts) "every happy-path fixture ends with exactly one `done`". |
| **Ollama** | Some versions emit `"usage": null` instead of omitting the field. | `mapOpenAISSEData` only sets `usage` from a real object; `null` is treated as missing. See `openaiCompatEdges.spec.ts` "emits done with usage=null preserved as undefined". |
| **OpenAI** | Quarkus / LLM gateways sometimes emit `[DONE]` twice. | The parser dedupes — emits `done` at most once. See `openaiCompatEdges.spec.ts` "emits at most one `done`". |
| **All** | Some providers close the stream without `[DONE]` or `finish_reason`. | The adapter emits a terminal `done` regardless. See `openaiCompatEdges.spec.ts` "emits a terminal `done` when the stream ends without [DONE]". |
| **All** | The fetch may abort mid-stream (client disconnect, server timeout). | `AbortController` propagates to `fetch` and the body reader; the iterator stops cleanly. See `openaiCompatEdges.spec.ts` "aborts cleanly when the signal fires between chunks". |
| **All** | A 4-byte UTF-8 character may be split across network chunks. | `TextDecoder.decode(value, { stream: true })` reassembles the codepoint. See `openaiCompatEdges.spec.ts` "reassembles a multi-byte UTF-8 character split across two chunks". |
| **All** | An upstream error body may be 5 KB or more. | The error event includes the upstream body, **truncated to 300 chars** with an ellipsis marker. See `openaiCompatEdges.spec.ts` "truncates very long upstream error bodies". |

---

## 4. Adding a new provider (recipe)

1. **Pick a model** that exposes `/v1/chat/completions` with `stream: true`. Confirm by `curl`-ing the endpoint with a one-line `data: {...}` SSE request.
2. **Record the response shape.** Run a one-shot request, save the raw bytes, and note:
   - The exact `data: {...}` payload format (delta + finish_reason timing, usage presence/absence).
   - The exact `error: {...}` format on 4xx.
3. **Add a fixture in `openaiCompat.spec.ts`.** Copy the DeepSeek block, replace the chunks with your recorded shape, add an `expect(text).toBe('...')` assertion, and add an error-path fixture.
4. **Add a row to §1 above.** Note any quirks your provider has — what the adapter handles for you.
5. **Run the suite:**

   ```bash
   pnpm --filter @kedata-indonesia/docflow-server test:unit --run openaiCompat
   ```

6. **If the live deployment uses the new provider,** add a smoke-test note in [`docs/DEPLOYMENT.md` §7](../DEPLOYMENT.md) and verify on next deploy.

> **No live-network assertion** is required. The compat tests use recorded fixtures so the suite is deterministic, fast, and runs without API keys. (A live LLM smoke-test for the AI privacy invariant — no-egress with local provider — already lives in [`e2e/product/ai.spec.ts`](../../e2e/product/ai.spec.ts) from 7F-3.)

---

## 5. Related documents

- [`DEPLOYMENT.md` §3.4, §7](../DEPLOYMENT.md) — the operator-facing config reference.
- [`CLAUDE.md` §AI assistance (Phase 7)](../../CLAUDE.md) — the library / provider split, streaming-safety invariant.
- [`docs/plans/phase-7-ai-assistance.md`](../plans/phase-7-ai-assistance.md) — the original Phase 7 task spec.
- [`sprint-9-10-execution-plan.md` §2 B2-r1/r2/r3](../plans/sprint-9-10-execution-plan.md) — the Sprint 9-10 work that produced this matrix.