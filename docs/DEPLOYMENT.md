# Deployment Guide — DocFlow

> **Product:** `@kedata-indonesia/docflow-web` (frontend) + `@kedata-indonesia/docflow-server`
> (Express + Yjs websocket + Better Auth + AI proxy) + MongoDB + optional S3/MinIO + optional local LLM.
> Built on TipTap/ProseMirror + Yjs. Same-domain mode is the default and the path the reference
> deploy (`https://dev-docflow.kedata.cloud`) uses.
>
> **Plan refs:** [`docs/plans/phase-8-deployment-packaging.md`](phase-8-deployment-packaging.md) §A1-C4,
> [`docs/plans/sprint-9-10-execution-plan.md`](sprint-9-10-execution-plan.md) §2.

---

## 1. Topology

### Same-domain (default — recommended)

```
                       ┌────────────── host ──────────────┐
   HTTPS :443 ───────▶ │  nginx (TLS + reverse proxy)     │
                       │  (customer / Caddy / Traefik)   │
                       └──────────────┬──────────────────┘
                                      │
                       ┌──────────────▼──────────────────┐
                       │  web (nginx) :80                │
                       │  serves apps/web SPA            │
                       │  /api /auth /collab ──────┐     │
                       │                          │     │
                       └──────────────────────────┼─────┘
                                                  │
                       ┌──────────────────────────▼─────┐
                       │  server :3001                  │
                       │  REST · better-auth · WS · AI  │
                       └──┬───────────────┬─────────┬───┘
                          │               │         │
                       ┌──▼────┐   ┌──────▼─────┐ ┌─▼──────┐
                       │ Mongo │   │   S3 /     │ │  LLM  │
                       │ (Atlas│   │   MinIO    │ │ (opt) │
                       │  or   │   │  (cloud or │ │       │
                       │ local)│   │   local)   │ │       │
                       └───────┘   └────────────┘ └───────┘
```

The browser sees one origin. The `web` container's nginx reverses proxies `/api`, `/auth`, and
`/collab` (the Yjs websocket) to the `server` container. Single TLS cert, default cookie
settings, no cross-domain OAuth dance.

### Separate-domain

```
   HTTPS :443 ──▶ https://docs.example.com     (host nginx → web :80)
                       │
                       │ XHR/fetch + WSS
                       ▼
   HTTPS :443 ──▶ https://api.example.com      (host nginx → server :3001)
                       │
                       └── MongoDB / S3 / LLM
```

`apps/web` is built with `VITE_API_BASE_URL` and `VITE_COLLAB_WEBSOCKET_URL` baked in; its
nginx does **not** proxy (the `BACKEND_URL` runtime env is empty so the entrypoint strips the
proxy blocks). The browser calls the API domain directly, so CORS, Better Auth's
`storeStateStrategy: database`, `skipStateCookieCheck: true`, and `CLIENT_ORIGIN` /
`trustedOrigins` config are mandatory. OAuth redirect URI must point to the **backend** domain.

---

## 2. Quickstart (same-domain, clean machine)

```bash
# 1. Clone + install
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow
pnpm install

# 2. Copy the env file and fill the secrets
cp .env.docker.example .env.docker
$EDITOR .env.docker
#   - MONGODB_URI             (Atlas SRV or self-hosted)
#   - BETTER_AUTH_SECRET      (openssl rand -base64 32)
#   - S3_ENDPOINT / S3 keys   (your managed MinIO; STORAGE_BACKEND=gridfs to skip)
#   - AI_API_KEY              (or AI_BASE_URL for openai-compatible)
#   - Google/Microsoft/GitHub OAuth credentials (optional)

# 3. Build + start
docker compose -f docker-compose.yml up -d --build

# 4. Verify
curl http://localhost:8080/api/health
# → {"status":"ok","db":"connected","uptime":3600,"timestamp":"..."}
```

For a Dokploy / production deploy, build images, push to a registry, and point the host
reverse proxy at the `web` container (port 8080) — see §6 below.

---

## 3. Environment variables

> Single source of truth: `.env.docker.example` (compose) and `docker/server.env.example`
> (Dokploy template). Both are kept in sync; copy either to `.env.docker` / `apps/server/.env`
> and fill secrets. The table below names every var read by `apps/server/src/config.ts`,
> the storage/AI adapters, and the compose services.

### 3.1 Server (`apps/server`)

| Variable | Default | Required | Purpose |
|----------|---------|----------|---------|
| `PORT` | `3001` | no | HTTP + WS port |
| `NODE_ENV` | `production` | no | Runtime mode |
| `MONGODB_URI` | `mongodb://localhost:27017/docs-editor` | **yes** | MongoDB connection. `mongodb+srv://` URIs skip the local TCP healthcheck in the entrypoint. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | **yes** | CORS + Better Auth trusted origins. Comma-sep for multiple frontends. |
| `SESSION_STRATEGY` | `cookie` | no | `cookie` or `jwt` |
| `BETTER_AUTH_SECRET` | — | **yes** | Session signing secret. `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | `http://localhost:3001` | yes (cross-domain) | Public backend origin. |
| `EMAIL_PASSWORD_ENABLED` | `true` | no | Local login. First-class for self-host; set `false` to disable. |
| `EMAIL_VERIFICATION_REQUIRED` | `false` | no | Require verified email before login. |
| `GOOGLE_ENABLED` | `true` | no | Google OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | required if enabled | Google OAuth credentials |
| `GOOGLE_CALLBACK_URL` | _none_ | no | Override (defaults to `{BETTER_AUTH_URL}/api/auth/callback/google`) |
| `GITHUB_ENABLED` | `false` | no | GitHub OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | required if enabled | GitHub OAuth credentials |
| `MICROSOFT_ENABLED` | `false` | no | Microsoft Azure AD OAuth |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | — | required if enabled | MS OAuth credentials |
| `RATE_LIMIT_MAX` | `100` | no | General API rate limit (per 15 min per IP) |
| `RATE_LIMIT_AUTH_MAX` | `20` | no | Auth route rate limit |
| `RATE_LIMIT_UPLOAD_MAX` | `30` | no | Upload route rate limit |
| `RATE_LIMIT_AI_MAX` | `20` | no | AI route rate limit |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | no | Pino level: `trace` `debug` `info` `warn` `error` |

### 3.2 Collaboration persistence (Phase 1)

| Variable | Default | Purpose |
|----------|---------|---------|
| `COLLAB_WRITE_DEBOUNCE_MS` | `2500` | Debounce for Mongo-backed Yjs writes. |

Yjs binary state is stored in the `collabstates` collection (authoritative);
`Document.content` is a derived read-model.

### 3.3 Asset storage (Phase 4)

| Variable | Default | Purpose |
|----------|---------|---------|
| `STORAGE_BACKEND` | `gridfs` | `gridfs` (single-container, reuses Mongo) or `s3` (MinIO/S3-compatible). |
| `STORAGE_MAX_UPLOAD_BYTES` | `10485760` (10 MB) | Max upload size |
| `STORAGE_ALLOWED_MIME` | `image/png,image/jpeg,image/gif,image/webp,image/svg+xml` | Comma-sep MIME allowlist |
| `S3_ENDPOINT` | _none_ | **Required** when `STORAGE_BACKEND=s3`. e.g. `https://minio.your-cloud.example.com` for managed, `http://minio:9000` for local. |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_BUCKET` | `docflow-assets` | Bucket name |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | — | **Required** when `STORAGE_BACKEND=s3` |
| `S3_FORCE_PATH_STYLE` | `true` | MinIO needs path-style; set `false` for virtual-hosted AWS |

The bucket stays private; the server proxies bytes via `GET /api/assets/:id` with auth
enforced server-side. No public bucket, no CDN.

### 3.4 AI assistance (pluggable provider — issue #119)

The server no longer proxies LLM completions. The tenant admin configures the
provider in the web app (**AI Settings** in the user menu) and browsers call
the LLM directly — rotating providers or keys needs no redeploy. The Phase 7
proxy variables (`AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_FAST_MODEL`,
`AI_HEAVY_MODEL`, `AI_API_KEY`, `AI_MAX_TOKENS`, `AI_LOG_PROMPTS`) were
removed.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_EMAILS` | — | Comma-separated emails allowed to write the tenant AI config. **Required** for the AI Settings page to save. |
| `AI_CONFIG_PATH` | `data/ai-config.json` | Where the tenant LLM config is persisted. Point at the mounted data volume (e.g. `/data/ai-config.json`). |

**CORS note:** because browsers call the LLM directly, the endpoint must
allow the web origin. Ollama: set `OLLAMA_ORIGINS`. Hosted OpenAI does not
allow browser-direct calls — put a small same-origin proxy/gateway in front
(see [`docs/AI_PROVIDERS.md`](AI_PROVIDERS.md)).

### 3.5 AI embeddings / RAG (Phase 7E)

| Variable | Default | Purpose |
|----------|---------|---------|
| `AI_RAG_VECTOR_BACKEND` | `scan` | `scan` (app-side cosine, works on any Mongo) or `atlas` (Mongo Atlas `$vectorSearch`, needs the manual index). |
| `AI_EMBED_MODEL` | `text-embedding-3-small` | Embedding model |
| `AI_EMBED_BASE_URL` | _none_ | **Required** for the RAG draft extension (no fallback since #119). |
| `AI_EMBED_API_KEY` | _none_ | Embeddings key (unused for keyless local endpoints). |
| `AI_EMBED_DIMENSIONS` | `1536` | Output vector length. OpenAI `text-embedding-3-*` supports shortening; local models (e.g. `nomic-embed-text`) **must** match their native length. |
| `VECTOR_INDEX_NUM_DIMENSIONS` | `1536` | Only for `AI_RAG_VECTOR_BACKEND=atlas` — must equal `AI_EMBED_DIMENSIONS` AND the Atlas index `numDimensions`. Boot warns on mismatch. |

### 3.6 Frontend build args (`apps/web`, baked at build time)

| Variable | Same-domain | Separate-domain |
|----------|-------------|-----------------|
| `VITE_API_BASE_URL` | _empty → proxied_ | `https://api.example.com` |
| `VITE_COLLAB_WEBSOCKET_URL` | _empty → same-origin `/collab`_ | `wss://api.example.com/collab` |

### 3.7 Frontend container runtime

| Variable | Same-domain | Separate-domain |
|----------|-------------|-----------------|
| `BACKEND_URL` | `http://server:3001` | _empty (proxy blocks stripped by entrypoint)_ |

### 3.8 Optional infrastructure (compose-only, self-hosted datastores)

| Variable | Example | Purpose |
|----------|---------|---------|
| `MONGO_INITDB_DATABASE` | `docs-editor` | Init DB name for the local Mongo container |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | — | MinIO admin credentials (only if you run the local MinIO service) |

### 3.9 Variable reference

For the most current example values, copy from:
- `.env.docker.example` — compose `env_file` (self-host)
- `docker/server.env.example` — Dokploy / per-service (Dokploy UI doesn't read files)

Both files are kept in sync; if you change one, change the other.

---

## 4. Google Cloud Console (OAuth)

1. Open <https://console.cloud.google.com/apis/credentials>.
2. Create **OAuth 2.0 Client ID** → **Web application**.
3. Add **Authorized redirect URIs**:
   - Same-domain: `https://docs.example.com/api/auth/callback/google`
   - Separate-domain: `https://api.example.com/api/auth/callback/google`
4. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your server env.
5. In separate-domain mode, also set `GOOGLE_CALLBACK_URL=https://api.example.com/api/auth/callback/google`.

> ⚠️ The redirect URI must point to the **backend domain**, not the frontend domain. After
> Google authorizes the user, Better Auth redirects to the frontend via the `callbackURL` sent
> by the client.

GitHub + Microsoft OAuth follow the same pattern (`ENABLED`, `CLIENT_ID`, `CLIENT_SECRET`).

---

## 5. MongoDB Atlas

1. Create a cluster (M10+ for production).
2. Create a database user with read/write permissions on the `docs-editor` database.
3. **Network Access:** whitelist your server IP (or `0.0.0.0/0` if you front everything with a
   VPN / private network).
4. Get the connection string → paste into `MONGODB_URI=mongodb+srv://...`.

For local development / self-host, the compose file ships an optional commented-out `mongo`
service with `docker/mongo-init.js` mounted for first-boot schema setup (see §11).

---

## 6. Storage (MinIO / S3)

- **Cloud-managed (current prod):** set `STORAGE_BACKEND=s3`, point `S3_ENDPOINT` at your
  managed MinIO or S3-compatible endpoint, fill the credentials.
- **Self-hosted MinIO:** uncomment the `minio` service in `docker-compose.yml`,
  set `S3_ENDPOINT=http://minio:9000`, and provision the bucket via the `minio-mc` init
  container (or via the MinIO console at `:9001`).
- **No S3 (single-container):** leave `STORAGE_BACKEND=gridfs` (the default) — images go
  into Mongo's GridFS. No external service needed.

The bucket stays private. The server proxies bytes via `GET /api/assets/:id` with auth
enforced server-side.

---

## 7. AI provider

Since the pluggable AI provider work (issue #119), the server no longer
proxies LLM calls. There is nothing to choose by env for completions: set
`ADMIN_EMAILS` + `AI_CONFIG_PATH` (§3.4), then let the tenant admin pick the
provider in the web app's **AI Settings** page (OpenAI-compatible endpoint,
Ollama, vLLM, a gateway — anything speaking `/chat/completions` SSE).

| Use case | Setup |
|----------|-------|
| Any OpenAI-compatible endpoint | AI Settings → base URL + bearer key + model |
| Local Ollama | AI Settings → `http://<ollama-host>:11434/v1`, auth `none`; set `OLLAMA_ORIGINS` on the Ollama side for CORS |
| Hosted provider without browser CORS (e.g. OpenAI) | Small same-origin proxy/gateway in front; point AI Settings at it |

For the **compatibility matrix** (per-provider base URLs, auth shapes, CORS
notes, and known quirks), see [`docs/AI_PROVIDERS.md`](AI_PROVIDERS.md). The
browser-side provider is unit-tested in
`packages/core/src/ai/__tests__/openaiCompatibleProvider.test.ts`.

> **B2 scope:** the local LLM compose profile (Ollama container in `docker-compose.yml`
> under `profiles: [local-llm]`) is **deferred** to the "pure on-prem" backlog per
> [`sprint-9-10-execution-plan.md`](sprint-9-10-execution-plan.md) §2 — revisit when a
> privacy-strict on-prem customer is on the roadmap. The library is **already** agnostic
> for any provider that speaks OpenAI's `/chat/completions` streaming protocol.

Privacy: `AI_LOG_PROMPTS=false` by default. With a local provider + logging off, no document
content leaves the network.

---

## 8. Build & push images

```bash
# Build (same-domain — leave VITE_* empty for proxying)
docker build -f Dockerfile.server -t docflow-server:latest .
docker build -f Dockerfile.web    -t docflow-web:latest    .

# Optional library showcase (backend-free demo image)
docker build -f Dockerfile.demo -t docflow-demo:latest .

# Build for separate-domain (the SPA must bake the API URL at build time)
docker build \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  --build-arg VITE_COLLAB_WEBSOCKET_URL=wss://api.example.com/collab \
  -f Dockerfile.web -t docflow-web:latest .

# Tag + push
docker tag docflow-server:latest registry.yourcompany.com/docflow-server:v1.0.0
docker tag docflow-web:latest    registry.yourcompany.com/docflow-web:v1.0.0
docker push registry.yourcompany.com/docflow-server:v1.0.0
docker push registry.yourcompany.com/docflow-web:v1.0.0
```

> **Dockerfiles:** the canonical `Dockerfile.{server,web,demo}` live at the repo **root** and
> are referenced by both the compose files and the Dokploy deployment. Supporting infra files
> (nginx configs, entrypoints, env templates, `mongo-init.js`) live under `docker/`.

---

## 9. Run

```bash
# Self-host (same-domain)
docker compose -f docker-compose.yml up -d --build

# Self-host (separate-domain — same compose, different env)
VITE_API_BASE_URL=https://api.example.com \
VITE_COLLAB_WEBSOCKET_URL=wss://api.example.com/collab \
BACKEND_URL= \
docker compose -f docker-compose.yml config   # validate
docker compose -f docker-compose.yml up -d --build

# Optional library showcase (backend-free)
docker compose --profile showcase -f docker-compose.yml up -d

# Health
docker ps
docker logs docflow-server -f
curl http://localhost:8080/api/health
# → {"status":"ok","db":"connected","uptime":3600,"timestamp":"..."}

# Stop
docker compose -f docker-compose.yml down
```

---

## 10. Monitoring

```bash
# Health endpoint (server)
GET /api/health
# → {"status":"ok","db":"connected","uptime":3600,"timestamp":"..."}

# Logs (JSON for ELK/Datadog/etc.)
docker logs docflow-server -f
# → {"level":30,"method":"POST","url":"/api/documents","status":200,"duration":"45ms","ip":"..."}
```

The server uses pino; the entrypoint picks `pino-pretty` in non-production.

---

## 11. Backup / restore

> **Both stores must be backed up together.** The Yjs document state (Mongo) is the source
> of truth for collab docs; the `Document.content` / `plainText` fields are a server-written
> derived read-model. Asset references in `Document.content` point to objects in MinIO/S3 —
> if an object is missing, the document renders broken.

### 11.1 MongoDB (Atlas)

- **Atlas:** automatic continuous backup + PITR is enabled by default on M10+. Restore via
  the Atlas UI → "Backup" → "Restore".
- **Self-hosted Mongo:** `mongodump --uri "$MONGODB_URI" --out ./backup-$(date +%F)` and
  restore with `mongorestore --uri "$MONGODB_URI" ./backup-<date>/docs-editor`.

### 11.2 Object storage (MinIO / S3)

- **Managed S3:** enable bucket versioning (rollback) + cross-region replication (DR).
- **Self-hosted MinIO:** `mc mirror <source> <target>` to a backup bucket or a remote site.

### 11.3 Restore drill

Recommended quarterly drill:

1. Cold backup of Mongo (`mongodump`) + MinIO (`mc mirror`).
2. Spin up a fresh stack (test compose) with the backups as the data sources.
3. Verify: log in, open a doc, confirm edits persist, confirm an image loads.
4. Document in your runbook how long the drill took + any failed steps.

---

## 12. Upgrade

```bash
# Tag a new version
docker tag docflow-server:latest registry.yourcompany.com/docflow-server:v1.1.0
docker tag docflow-web:latest    registry.yourcompany.com/docflow-web:v1.1.0
docker push registry.yourcompany.com/docflow-server:v1.1.0
docker push registry.yourcompany.com/docflow-web:v1.1.0

# Recreate the running stack (named volumes are preserved)
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d

# CAVEAT: Docker Compose does NOT run database migrations. Read the release
# notes for any breaking env / schema changes (e.g. Phase 9 roles will
# change `Document.collaborators` from string[] to {userId, role}[]).
```

**Rollback:** `docker compose -f docker-compose.yml down` (without `-v` —
**never** use `-v`, it removes the named volumes), then re-pull the previous image
tag and `up -d` again. If you backed up Mongo + MinIO before the upgrade, restore
from those backups instead.

---

## 13. Troubleshooting

| Issue | Fix |
|-------|-----|
| MongoDB auth failed | Check `MONGODB_URI` — no `<` `>` brackets |
| Better Auth crash | Set `BETTER_AUTH_SECRET` (32+ chars) |
| Google login redirect fail | Redirect URI must match Google Console exactly and point to **backend** domain |
| `state_not_found` / OAuth loop | Set `account.storeStateStrategy: 'database'` and `skipStateCookieCheck: true` for cross-domain |
| Rate limited (429) | Increase `RATE_LIMIT_*` or wait 15 min |
| CORS error | Set `CLIENT_ORIGIN` to your exact frontend domain |
| Session not persisting across domains | Use HTTPS + tune Better Auth cookie config (`advanced.cookie`) if needed |
| AI routes 503 | Set `AI_API_KEY` (Claude) or `AI_BASE_URL` (openai-compatible). Boot warnings list the missing vars. |
| AI 400 / "model not found" | If `AI_PROVIDER=openai-compatible`, the model names must match your endpoint — boot warns if it looks like a vendor default. |
| Uploads 503 | `STORAGE_BACKEND=s3` requires `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. |
| Yjs edits seem to lose on reload | Check `docker logs docflow-server` for `mongoPersistence` errors — Phase 1 persistence is the source of truth. |
| `AI_EMBED_DIMENSIONS` ≠ `VECTOR_INDEX_NUM_DIMENSIONS` warning | Match all three (3.3 of phase-7e plan). For Atlas, also align the manual index. |

---

## 14. Local development (no Docker)

For development on the local machine without the full container stack:

```bash
# Backend
cd apps/server
MONGODB_URI=mongodb://localhost:27017/docs-editor \
BETTER_AUTH_SECRET=dev-secret \
BETTER_AUTH_URL=http://localhost:3001 \
CLIENT_ORIGIN=http://localhost:5173 \
EMAIL_PASSWORD_ENABLED=true \
pnpm dev

# Web (separate-domain, so the SPA calls the API directly)
cd apps/web
VITE_API_BASE_URL=http://localhost:3001 \
VITE_COLLAB_WEBSOCKET_URL=ws://localhost:3001/collab \
pnpm dev

# Optional: demo (backend-free showcase)
cd apps/demo
pnpm dev
```

Open:
- Product frontend: `http://localhost:5173`
- Health: `http://localhost:3001/api/health`

Add the dev OAuth redirect URI to your Google Console:
`http://localhost:3001/api/auth/callback/google`.