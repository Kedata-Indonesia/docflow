# Self-Hosted AI — Operator Guide

> **Catatan Cakupan Repositori:** Dokumen ini adalah panduan operator untuk server host di `Kedata-Indonesia/docflow-app`. Untuk integrasi library AI, lihat [`EMBEDDING_AI.md`](EMBEDDING_AI.md).
>
> For operators deploying the DocFlow SaaS stack (Docker / Dokploy).
> Architecture: [`plans/PLUGGABLE_AI_PROVIDER.md`](plans/PLUGGABLE_AI_PROVIDER.md).
> Embedding the library in your own app: [`EMBEDDING_AI.md`](EMBEDDING_AI.md).

## How it works

There is **no server-side LLM proxy**. The tenant admin configures the
provider once in the web app; every user's browser then calls the LLM
directly. The server only stores the config file — it never sees completion
traffic, holds no LLM keys in env, and does no token metering.

## Setup checklist

1. **Server env** (see [`DEPLOYMENT.md` §3.4](DEPLOYMENT.md)):

   ```env
   ADMIN_EMAILS=admin@yourcompany.com        # required — who may write AI config
   AI_CONFIG_PATH=/data/ai-config.json       # on the mounted data volume
   ```

   Redeploy after changing `ADMIN_EMAILS` (env is read at boot).

2. **Tenant admin opens the web app** → user menu (top right) → **AI Settings**
   (visible to admins only) → fill base URL / auth / model → **Test
   connection** → **Save**.

3. Done. Every signed-in user gets the AI sidebar in the editor; changes
   apply without a redeploy (the config file is re-read on every request).

## The AI Settings fields

| Field | Notes |
|-------|-------|
| Base URL | Any OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1`, `http://ollama:11434/v1` |
| Authentication | `Bearer token` / `Custom header` / `None` (keyless local) |
| Model | e.g. `gpt-4o-mini`, `qwen2.5:14b` |
| Test connection | Server-side probe of `GET {baseUrl}/models` — token-free. Failure degrades to "shape validated only" (not all compatible endpoints implement `/models`); you may still save. |
| Clear config | Removes the config; AI features go inert for everyone. |

**Security notes:** the config file holds credentials — it is written
`0600` and should live on the data volume (already covered by
`apps/server/data/` in `.gitignore`). Writes are admin-only
(`requireAdmin`). Reads default to `visibility: 'shared'` — any
authenticated user gets the config in their browser **by design** (the
browser holds the key; it is not secret from tenant users, only from
outsiders).

### Proxy mode (`visibility: 'admin-only'`, issue #126)

If tenant users must NOT see the key, enable **"Hide key from non-admin
users"** in AI Settings:

- `GET /api/ai/config` → 403 for non-admins; the key never leaves the server.
- Non-admin completions go through `POST /api/ai/complete` — a thin
  forwarder that attaches the key server-side (rate-limited by
  `RATE_LIMIT_AI_MAX`). Users see only your own server in their network
  tab.
- Admins keep browser-direct calls (no extra hop).
- Trade-off: the server carries LLM traffic again (latency + bandwidth),
  and abuse protection on that route is your concern (`aiLimiter`).

The same `/api/ai/complete` route also works as **CORS relief** even in
`shared` mode — point the app at it when the LLM endpoint cannot answer
browser preflight.

## CORS (the common failure)

Browsers call the LLM directly → the endpoint must allow your web origin:

- **Ollama:** `OLLAMA_ORIGINS=https://your-docflow-host`
- **OpenAI API:** no browser CORS — put a thin same-origin proxy in front
  (recipe in [`AI_PROVIDERS.md` §3](AI_PROVIDERS.md)) and point AI Settings
  at it.

Symptom: "Test connection" passes (it probes from the *server*) but the AI
sidebar errors on first use → almost always browser-side CORS.

## RAG "Draft with citations" (optional)

The cited-drafting extension (`POST /api/ai-extensions/draft`) stays
server-side because vector search needs Mongo. It uses the saved tenant
config for its LLM call, plus server-side embeddings env
([`DEPLOYMENT.md` §3.5](DEPLOYMENT.md)): `AI_EMBED_BASE_URL` /
`AI_EMBED_MODEL` / `AI_EMBED_API_KEY` (+ `AI_RAG_VECTOR_BACKEND=scan`
default). Without embeddings configured, the route returns 503 and the
sidebar's draft action stays disabled — everything else keeps working.

## What changed from Phase 7 (migration notes)

- Removed env: `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_FAST_MODEL`,
  `AI_HEAVY_MODEL`, `AI_API_KEY`, `AI_MAX_TOKENS`, `AI_LOG_PROMPTS`.
- Removed route: the Phase 7 `POST /api/ai/complete` (env-adapter proxy).
  (#126 later re-added the path as a thin config-driven forwarder — see the
  proxy-mode section above.)
- Moved route: `POST /api/ai/draft` → `POST /api/ai-extensions/draft`.
- Server-side prompt logging (`AI_LOG_PROMPTS`) is gone — completions never
  touch the server. If you need audit logging, put it in your gateway.
- Rate limiting of completions is now the provider's/gateway's concern; the
  server-side `aiLimiter` only guards the draft extension.
