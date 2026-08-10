# Per-User BYOK (Bring Your Own Key)

## 1. Goal

Every signed-in user can register their own LLM (OpenAI, Claude, or any
OpenAI-compatible endpoint) from the web app — no admin involvement, no
redeploy. The tenant-level AI Settings (issue #119) becomes the **fallback**
for users who have not set a personal config.

This amends [PLUGGABLE_AI_PROVIDER.md](PLUGGABLE_AI_PROVIDER.md) §5.3 /
§6.2 ("No per-user BYOK in our SaaS web app") — deferred at the time, now
explicitly requested.

## 2. Why now

- Tenant admins should not be a bottleneck for AI access; different users
  want different providers (some have personal OpenAI keys, some want
  Claude, some a company vLLM).
- Claude is a first-class ask, and the OpenAI-compatible provider cannot
  cover it — so this work also ships a native `claudeProvider`.

## 3. Design

### 3.1 Precedence

```
user's own config (Mongo, per-user)  →  tenant config (file, #119)  →  AI inert
```

The browser bootstrap reads ONE endpoint and gets back whichever config
applies to the caller. The client never needs to know which level won
(though the API tells it, for UI display: "Using your personal key" vs
"Using workspace config").

### 3.2 Storage — Mongo, not files

Per-user state belongs in the database (multi-entity by nature, already
have `userId` scoping everywhere):

```
userAiConfig: {
  _id, userId (unique index),
  provider: 'openai-compatible' | 'claude',
  baseUrl: string,           // required for openai-compatible; fixed for claude
  auth: { type: 'bearer', apiKey } | { type: 'header', name, value } | { type: 'none' },
  model: string,
  createdAt, updatedAt
}
```

**Key protection:** the apiKey is stored as-is (consistent with the #119
model — the browser holds the key anyway; it is returned to its owner's
browser only). Documented as a deliberate choice; field-level encryption
is a later hardening option, not v1. Reads are scoped strictly to
`req.userId`; no admin override in v1.

### 3.3 API

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /api/ai/config` | requireAuth | **Changed**: returns the caller's effective config — personal if set, else tenant, else 404 — plus `scope: 'user' \| 'tenant'`. |
| `GET /api/users/me/ai-config` | requireAuth | Read the caller's own config (404 if unset). |
| `POST /api/users/me/ai-config` | requireAuth | Create/replace own config. Same shape validation + `?dryRun=true` probe as the tenant route. |
| `DELETE /api/users/me/ai-config` | requireAuth | Remove own config (falls back to tenant). |

The tenant route (`POST/DELETE /api/ai/config`) stays admin-only,
unchanged. The probe for `claude` configs hits Anthropic's
`GET /v1/models` with `x-api-key` + `anthropic-version` headers; same
graceful-degradation rule (non-200 → `verified: false`).

### 3.4 Library — `claudeProvider`

New `packages/core/src/ai/claudeProvider.ts` implementing the existing
`AIProvider` interface against the Anthropic Messages API
(`POST {baseUrl}/v1/messages`, `anthropic-version: 2023-06-01`,
`x-api-key` auth, SSE event types `content_block_delta` → delta,
`message_stop` → done, `error` → error). Exported from core + vue next to
`openaiCompatibleProvider`. The `provider` field in the config selects
which factory the bootstrap uses.

CORS: `api.anthropic.com` supports browser calls only with the
`anthropic-dangerous-direct-browser-access: true` header — the provider
sets it, and the settings UI notes the implication (the key is used from
the browser by design, same as everything else here).

### 3.5 Web app

- `SettingsAI.vue` becomes **"My AI"** — visible to every signed-in user
  (not just admins), editing `/api/users/me/ai-config`, with a provider
  selector (OpenAI-compatible / Claude) that switches the base-URL field
  (editable vs fixed) and the auth form.
- Tenant `AI Settings` stays visible to admins as a separate entry.
- `aiProviderBootstrap.ts` reads `GET /api/ai/config` (unchanged URL) —
  the server now resolves the effective config. The bootstrap learns the
  `provider` field to pick `claudeProvider` vs `openaiCompatibleProvider`.

### 3.6 RAG draft

`/api/ai-extensions/draft` resolves the **caller's** effective config the
same way (personal → tenant → 503). Per-user keys work for draft too.

## 4. What we explicitly do NOT do (v1)

- No field-level encryption of stored keys (documented risk, later hardening).
- No admin view of "who has keys set" (audit endpoint is a later option).
- No per-user rate limiting beyond the existing draft `aiLimiter`.
- No Gemini/other native adapters — the OpenAI-compatible provider covers
  gateways; Claude is added because it is a top user ask.

## 5. File plan

| Area | Change |
|------|--------|
| `packages/core/src/ai/claudeProvider.ts` | NEW — native Anthropic provider + tests (SSE parsing, headers, error events, abort). |
| `packages/core/src/ai/index.ts`, `packages/core/src/index.ts`, `packages/vue/src/index.ts` | Export `claudeProvider`. |
| `apps/server/src/models/UserAiConfig.ts` | NEW — schema + unique `userId` index. |
| `apps/server/src/routes/aiConfig.ts` | EDIT — GET resolves effective config (personal → tenant) + `scope`; shape validation accepts `provider`; claude probe shape. |
| `apps/server/src/routes/users.ts` (or new `userAiConfig.ts`) | NEW routes `/api/users/me/ai-config` (GET/POST/DELETE). |
| `apps/server/src/routes/aiExtensions.ts` | EDIT — draft resolves the caller's effective config. |
| `apps/server/src/ai/configFile.ts` | Keep (tenant fallback); add `resolveAIConfig(userId)` helper (Mongo → file). |
| `apps/web/src/components/SettingsAI.vue` | Rework: personal "My AI" for everyone, provider selector, scope indicator. |
| `apps/web/src/App.vue` | Show "My AI" for all users; keep admin-only tenant "AI Settings". |
| `apps/web/src/ai/aiProviderBootstrap.ts` | Pick provider impl by `provider` field. |
| `apps/web/src/api.ts` | Personal config helpers. |
| Docs | Update `SELF_HOSTED_AI.md`, `EMBEDDING_AI.md`, `AI_PROVIDERS.md` (Claude row), `DEPLOYMENT.md`. |

## 6. Order of work

1. `claudeProvider` + unit tests (library).
2. `UserAiConfig` model + personal routes + effective-config resolution + tests.
3. Draft route uses effective config.
4. Web: "My AI" UI + bootstrap provider selection.
5. Docs + E2E extension (personal overrides tenant; claude-shaped config validation).

## 7. Acceptance criteria

- A non-admin user can register a personal OpenAI-compatible config, and the
  AI sidebar streams from it — while another user without one keeps using the
  tenant config.
- `provider: 'claude'` configs validate (shape) and stream via `claudeProvider`.
- Deleting a personal config reverts that user to the tenant config without a reload.
- `GET /api/ai/config` never returns another user's config (401/404 paths pinned by tests).
- Typecheck + unit + e2e green; `pnpm test:unit` covers the new routes and the
  claude SSE parser.
