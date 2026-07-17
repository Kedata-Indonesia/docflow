# Phase 8 — On-prem Deployment Packaging · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 8 · **Priority:** P1 · **Depends on:** Phases 1, 3, 4, 7 · **Last updated:** 2026-07-17

> **Goal:** a customer can stand up the **whole product** (web + server + Mongo + MinIO,
> optionally a local LLM) on their own hardware with `docker compose up`, following the
> docs alone. On-prem = **self-hosted with internet** (external OAuth/CDN allowed, not
> air-gapped). AI provider is chosen per deployment by env. The current packaging targets
> the **demo**, not the first-party `apps/web` product — this phase re-points it.

---

## 1. Current State (what we're extending)

Packaging today is **demo-oriented, two-service, and pre-dates Phases 1/3/4/7**. It works for the library showcase but does not describe or provision the product stack.

| Area | What exists today | File |
|------|-------------------|------|
| Compose | `server` + `demo` services only; Mongo is **commented out**; no MinIO, no `web`, no LLM | [docker/docker-compose.yml:1-78](../../docker/docker-compose.yml) |
| Server image | Multi-stage; `docker/` variant node:20 + `npm i -g pnpm@9`; runtime copies `dist` + vendored `y-websocket` | [docker/Dockerfile.server:1-27](../../docker/Dockerfile.server) |
| Server image (dup) | **Second, divergent** root variant node:22 + corepack, `--prod` install, HEALTHCHECK inline | [Dockerfile.server:1-64](../../Dockerfile.server) |
| Demo image | Builds Vite SPA → nginx; bakes `VITE_API_BASE_URL` / `VITE_COLLAB_WEBSOCKET_URL` at build | [docker/Dockerfile.demo:1-38](../../docker/Dockerfile.demo), [Dockerfile.demo:1-68](../../Dockerfile.demo) |
| Same-domain proxy | nginx `location /api /auth /collab` → `${BACKEND_URL}` via `envsubst`; static SPA fallback | [docker/nginx.conf:1-54](../../docker/nginx.conf) |
| Separate-domain proxy | `nginx.backend.conf` proxies everything (incl. `/collab` WS upgrade) to `server:3001` — **but no compose service references it** | [docker/nginx.backend.conf:1-30](../../docker/nginx.backend.conf) |
| Runtime proxy toggle | entrypoint strips `/api /auth /collab` blocks when `BACKEND_URL` empty (separate-domain) | [docker/entrypoint.demo.sh:1-22](../../docker/entrypoint.demo.sh) |
| DB wait | server entrypoint TCP-waits for Mongo; skips for `mongodb+srv://` | [docker/entrypoint.sh:1-41](../../docker/entrypoint.sh) |
| DB init | creates `users/documents/sessions/collabsnapshots`; **unique `googleId` index**; no `collabstates`, no storage | [docker/mongo-init.js:1-21](../../docker/mongo-init.js) |
| Env examples | Dokploy-oriented, **hardcoded `*.kedata.cloud` domains**; `.env.docker.example` is the compose `env_file` | [docker/server.env.example:1-52](../../docker/server.env.example), [docker/demo.env.example:1-19](../../docker/demo.env.example), [.env.docker.example:1-43](../../.env.docker.example) |
| Health | server exposes `GET /api/health` (`status/db/uptime/timestamp`); compose + Dockerfile healthchecks curl it | [apps/server/src/index.ts:42-51](../../apps/server/src/index.ts), [docker/docker-compose.yml:13-18](../../docker/docker-compose.yml) |
| Docs | `DEPLOYMENT.md` documents both modes but for the **demo**, and assumes **Mongo Atlas** (not self-hosted) | [docs/DEPLOYMENT.md:1-419](../DEPLOYMENT.md) |
| Env surface | config reads Mongo/auth/OAuth/rate-limit/log vars — **no AI_*, no storage vars** | [apps/server/src/config.ts:13-43](../../apps/server/src/config.ts) |
| Licensing | README says "MIT" ([README.md:342]); **no `license` field in any package.json, no `LICENSE` file** | [README.md:340-342](../../README.md) |

**Gaps this phase closes:**
- **No `apps/web` in the stack.** `apps/` holds only `demo` + `server`; Phase 3 introduces `apps/web`. Packaging must build/ship `web` as the product frontend (demo becomes an optional/omitted showcase image).
- **No self-hosted datastore in compose.** Mongo is commented out; MinIO (Phase 4) is absent. Turn-key on-prem requires both as first-class services with volumes + healthchecks.
- **No AI provider wiring.** Phase 7 adds `AI_PROVIDER/AI_BASE_URL/AI_MODEL/AI_API_KEY` and a server `ai` route; neither the compose nor env reference expose them, and there is no optional local-LLM (Ollama/vLLM) service.
- **Two divergent Dockerfile sets** (root node:22 vs `docker/` node:20) — a maintenance hazard; consolidate.
- **`mongo-init.js` is stale** — missing `collabstates` (Phase 1 authoritative Yjs store) and the `googleId` unique index breaks email/password-only users (no `googleId`).
- **Docs assume Atlas + demo**, not a self-hosted, product-grade, one-command stack.
- **Licensing undeclared** — on-prem distribution needs an explicit, recorded decision.

---

## 2. Target Architecture

Single-host, single-instance (multi-instance scaling is out of scope — see §7). One compose project brings up `web`, `server`, `mongo`, `minio`, and an **optional** `llm` service selected by a compose **profile**.

### Same-domain (default, simplest)

Browser sees one origin; the `web` container's nginx reverse-proxies API/auth/collab to `server`.

```
                          ┌──────────────────────── host ────────────────────────┐
  browser ── HTTPS :443 ─▶│ (edge TLS: host nginx / Caddy / Traefik — customer)   │
                          │                     │                                  │
                          │              ┌──────▼───────┐  docker network          │
                          │              │  web (nginx) │  serves apps/web SPA     │
                          │              │  :80         │  /api /auth /collab ───┐ │
                          │              └──────────────┘                        │ │
                          │   ┌───────────────────────────────────────────────┐ │ │
                          │   │            server :3001 (Express + WS)          ◀─┘ │
                          │   │  REST · better-auth · y-websocket · ai route     │ │
                          │   └──┬───────────────┬──────────────────┬───────────┘ │
                          │      │ Mongo         │ S3 API           │ OpenAI-compat │
                          │  ┌───▼────┐     ┌────▼─────┐       ┌─────▼──────┐       │
                          │  │ mongo  │     │  minio   │       │  llm       │       │
                          │  │ :27017 │     │  :9000   │       │ (optional  │       │
                          │  │ vol    │     │  :9001   │       │  profile,  │       │
                          │  │ db     │     │  vol data│       │  GPU)      │       │
                          │  └────────┘     └──────────┘       └────────────┘       │
                          └───────────────────────────────────────────────────────┘

  AI_PROVIDER=claude          → server → Claude API (egress to internet)
  AI_PROVIDER=openai-compat   → server → llm service (in-network, no egress)
```

### Separate-domain (frontend and API on different hosts/domains)

`apps/web` is built with `VITE_API_BASE_URL` / `VITE_COLLAB_WEBSOCKET_URL` baked in; its nginx does **not** proxy (blocks stripped by entrypoint when `BACKEND_URL` empty). The browser calls the API domain directly, so CORS + better-auth cross-domain cookie/state config is mandatory.

```
  browser
    │  app.example.com                         api.example.com
    ▼  (HTTPS :443)                            (HTTPS :443)
  ┌──────────────┐   XHR/fetch + WSS          ┌───────────────────────────────┐
  │ web (nginx)  │  ───────────────────────▶  │ server :3001                   │
  │ SPA only,    │   VITE_API_BASE_URL        │  CORS: CLIENT_ORIGIN           │
  │ no proxy     │   VITE_COLLAB_WEBSOCKET_URL│  better-auth trustedOrigins    │
  └──────────────┘                            │  storeStateStrategy=database   │
                                              │  skipStateCookieCheck=true     │
                                              └──┬──────────┬──────────┬────────┘
                                                 │          │          │
                                            ┌────▼───┐ ┌────▼────┐ ┌───▼────┐
                                            │ mongo  │ │  minio  │ │  llm   │
                                            └────────┘ └─────────┘ └────────┘

  OAuth redirect URI → {BETTER_AUTH_URL}/api/auth/callback/<provider>  (API domain)
  MinIO public object URLs → S3_PUBLIC_URL must resolve from the browser (own domain/CDN)
```

**Design decisions:**

1. **`web` replaces `demo` as the shipped frontend.** Same nginx + entrypoint mechanism (`docker/nginx.conf`, `docker/entrypoint.demo.sh`) generalizes; `demo` becomes a build-time-only / optional showcase image, not part of the product compose.
2. **One turn-key compose, profiles for the optional bits.** Base services `web + server + mongo + minio` always start; the local LLM is behind a `--profile local-llm` so internet/Claude users pay no GPU cost. Managed Mongo (Atlas) / external S3 remain supported by pointing env at them and not starting the local service.
3. **Datastores are self-hosted by default with named volumes.** `mongo-data`, `minio-data` persist across restarts/upgrades; `mongo-init.js` seeds indexes (corrected for Phase 1 `collabstates` + email/password users).
4. **AI is env-selected, never rebuilt.** `AI_PROVIDER` switches Claude ↔ local OpenAI-compatible endpoint (Phase 7 contract); the `llm` service exposes an OpenAI-compatible API the server reaches in-network so no document content leaves the host.
5. **Both deployment modes are first-class and documented end-to-end for the product** — not just the demo. Same-domain is the default recommendation; separate-domain is fully specified incl. cross-domain OAuth/cookie pitfalls.
6. **Edge TLS is the customer's responsibility** (host nginx/Caddy/Traefik + Let's Encrypt), as today; the compose exposes plain HTTP ports behind it.

---

## 3. Config / Env Matrix (N/A — no new data model)

Phase 8 adds **no schema**; it consolidates the **env surface** across all services into one reference. Grouped below; "Source" = where the variable is consumed/introduced.

### Server (`apps/server`)

| Var | Purpose | Default / example | Source |
|-----|---------|-------------------|--------|
| `PORT` | HTTP+WS port | `3001` | [config.ts:14](../../apps/server/src/config.ts) |
| `NODE_ENV` | runtime mode | `production` | compose |
| `MONGODB_URI` | Mongo connection (self-hosted `mongodb://mongo:27017/...` or Atlas `mongodb+srv://`) | `mongodb://mongo:27017/docs-editor` | [config.ts:17](../../apps/server/src/config.ts) |
| `CLIENT_ORIGIN` | CORS + better-auth trusted origins (comma-sep) | `https://docs.example.com` | [config.ts:15-16](../../apps/server/src/config.ts) |
| `SESSION_STRATEGY` | `cookie` \| `jwt` | `cookie` | [config.ts:18](../../apps/server/src/config.ts) |
| `BETTER_AUTH_SECRET` | **required** signing secret (`openssl rand -base64 32`) | — | auth setup |
| `BETTER_AUTH_URL` | public backend origin (redirect base) | `https://api.example.com` | auth setup |
| `EMAIL_PASSWORD_ENABLED` | local login | `true` | [config.ts:19-22](../../apps/server/src/config.ts) |
| `EMAIL_VERIFICATION_REQUIRED` | require verify | `false` | [config.ts:21](../../apps/server/src/config.ts) |
| `GOOGLE_ENABLED`/`_CLIENT_ID`/`_CLIENT_SECRET`/`_CALLBACK_URL` | Google OAuth | enabled | [config.ts:23-28](../../apps/server/src/config.ts) |
| `GITHUB_ENABLED`/`_CLIENT_ID`/`_CLIENT_SECRET` | GitHub OAuth | disabled | [config.ts:29-33](../../apps/server/src/config.ts) |
| `MICROSOFT_ENABLED`/`_CLIENT_ID`/`_CLIENT_SECRET` | Microsoft OAuth | disabled | [config.ts:34-38](../../apps/server/src/config.ts) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_AUTH_MAX` | rate limits | `100` / `20` | [config.ts:39-42](../../apps/server/src/config.ts) |
| `LOG_LEVEL` | pino level | `info` | logger |

### Collaboration (Phase 1)

| Var | Purpose | Default | Source |
|-----|---------|---------|--------|
| `COLLAB_WRITE_DEBOUNCE_MS` | debounce for Mongo-backed Yjs writes | `2500` | Phase 1 F1 (if exposed) |

> Persistence is Mongo-backed and automatic (no `YPERSISTENCE`). Yjs binary in `collabstates` is authoritative; `Document.content` is derived.

### Storage (Phase 4) — surface in compose + env reference; **names must match Phase 4's actual impl**

| Var | Purpose | Default / example |
|-----|---------|-------------------|
| `STORAGE_BACKEND` | `minio` (S3) \| `gridfs` (single-container fallback) | `minio` |
| `S3_ENDPOINT` | MinIO/S3 endpoint | `http://minio:9000` |
| `S3_REGION` | region | `us-east-1` |
| `S3_BUCKET` | object bucket | `docflow` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | credentials (= MinIO root or scoped key) | — |
| `S3_FORCE_PATH_STYLE` | required for MinIO | `true` |
| `S3_PUBLIC_URL` | browser-reachable base for object URLs (separate-domain/CDN) | `https://cdn.example.com` |

### AI (Phase 7)

| Var | Purpose | Default / example | Source |
|-----|---------|-------------------|--------|
| `AI_PROVIDER` | `claude` \| `openai-compatible` (Ollama/vLLM/OpenAI) | `claude` | [ROADMAP:224](../ENHANCEMENT_ROADMAP.md) |
| `AI_BASE_URL` | endpoint for OpenAI-compatible (`http://llm:11434/v1`) | — | Phase 7 |
| `AI_MODEL` | model id (`claude-sonnet-*`, `llama3.1:8b`, …) | provider default | Phase 7 |
| `AI_API_KEY` | Claude/OpenAI key (blank for keyless local) | — | Phase 7 |

### Web frontend build args (`apps/web`, baked at build time)

| Var | Purpose | Same-domain | Separate-domain |
|-----|---------|-------------|-----------------|
| `VITE_API_BASE_URL` | REST/auth base | *(empty → proxied)* | `https://api.example.com` |
| `VITE_COLLAB_WEBSOCKET_URL` | WS collab URL | *(empty → same origin `/collab`)* | `wss://api.example.com/collab` |

### Web container runtime

| Var | Purpose | Same-domain | Separate-domain |
|-----|---------|-------------|-----------------|
| `BACKEND_URL` | nginx proxy target (entrypoint `envsubst`) | `http://server:3001` | *(empty → proxy blocks stripped)* |

### Infrastructure (compose-only, self-hosted datastores)

| Var | Purpose | Example |
|-----|---------|---------|
| `MONGO_INITDB_DATABASE` | init DB name | `docs-editor` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO admin creds | — |

---

## 4. Task Breakdown

Grouped **A** (compose + images), **B** (AI + local-model profile), **C** (docs), **D** (licensing). Each lists files, work, acceptance, and dependencies (`⇐`).

### Group A — Turn-key compose + product images

**A1. Consolidate to a single Dockerfile set.** ⇐ none
- Files: [Dockerfile.server](../../Dockerfile.server), [docker/Dockerfile.server](../../docker/Dockerfile.server), [Dockerfile.demo](../../Dockerfile.demo), [docker/Dockerfile.demo](../../docker/Dockerfile.demo)
- Pick one canonical location (recommend `docker/`), one Node major, one install strategy; delete the divergent root copies (or make them thin references). Record which is authoritative in `DEPLOYMENT.md`.
- Accept: exactly one server + one frontend Dockerfile build path; `grep` finds no references to the removed files.

**A2. Add `apps/web` image.** ⇐ A1, Phase 3
- Files: `docker/Dockerfile.web` (new, from `Dockerfile.demo` pattern), reuse [docker/nginx.conf](../../docker/nginx.conf) + [docker/entrypoint.demo.sh](../../docker/entrypoint.demo.sh) (rename → `entrypoint.web.sh` or keep shared).
- Build `apps/web` (not demo) SPA; accept `VITE_API_BASE_URL` / `VITE_COLLAB_WEBSOCKET_URL` build args; serve via nginx with the same-domain proxy + separate-domain strip behavior.
- Accept: `docker build` produces a `web` image serving the product SPA; both modes verified in A6.

**A3. Self-hosted Mongo + MinIO as first-class services.** ⇐ none
- File: [docker/docker-compose.yml](../../docker/docker-compose.yml)
- Uncomment/promote `mongo` (image `mongo:7`, `mongo-data` volume, `mongo-init.js` mount, healthcheck `mongosh ping`). Add `minio` (`minio/minio`, `minio-data` volume, ports `9000`/`9001`, `MINIO_ROOT_USER/PASSWORD`, `/minio/health/ready` healthcheck) and a one-shot `minio-mc` init to create the `S3_BUCKET` and set a policy.
- Wire `server.depends_on` mongo+minio `service_healthy`; replace `demo` service with `web` (A2).
- Accept: `docker compose up` starts web+server+mongo+minio; all report healthy; data survives `down`/`up` (volumes).

**A4. Fix `mongo-init.js` for the current schema.** ⇐ Phase 1
- File: [docker/mongo-init.js](../../docker/mongo-init.js)
- Add `collabstates` collection + unique `roomId` index (Phase 1 authoritative store). Make the `googleId` index **sparse+unique** (or drop it) so email/password-only users don't collide on null. Keep text index on `documents`.
- Accept: fresh Mongo container initializes without duplicate-key errors when creating an email/password user and a collab doc.

**A5. Consolidated env template for the product.** ⇐ A2, A3, B1
- Files: [.env.docker.example](../../.env.docker.example) (compose `env_file`), [docker/server.env.example](../../docker/server.env.example), replace [docker/demo.env.example](../../docker/demo.env.example) → `web.env.example`
- Remove hardcoded `*.kedata.cloud` values → placeholder domains; include the full §3 matrix (server + collab + storage + AI + web + infra) with same-domain defaults and separate-domain overrides inline. Keep secret placeholders (`openssl rand -base64 32`).
- Accept: copying `.env.docker.example` → `.env.docker` and filling secrets yields a working same-domain stack with no other edits.

**A6. Health checks + startup ordering end-to-end.** ⇐ A3
- Files: [docker/docker-compose.yml](../../docker/docker-compose.yml), [docker/entrypoint.sh](../../docker/entrypoint.sh)
- Ensure server healthcheck (`/api/health`) plus mongo/minio healthchecks gate `depends_on`; extend `entrypoint.sh` to optionally wait for MinIO when `STORAGE_BACKEND=minio`. Keep the `mongodb+srv://` skip path.
- Accept: `docker compose up` reaches all-healthy from cold with no manual ret/restart; `curl /api/health` → `{"status":"ok","db":"connected"}`.

### Group B — AI provider config + optional local-model profile

**B1. Surface AI env in compose + server env.** ⇐ Phase 7
- Files: [docker/docker-compose.yml](../../docker/docker-compose.yml), [docker/server.env.example](../../docker/server.env.example), [.env.docker.example](../../.env.docker.example)
- Add `AI_PROVIDER/AI_BASE_URL/AI_MODEL/AI_API_KEY` to the server service env and env examples with two documented presets: (a) Claude API (default, needs internet), (b) local OpenAI-compatible (`AI_BASE_URL=http://llm:...`).
- Accept: setting `AI_PROVIDER=claude` + key works; switching to the local preset (with B2 running) works — **env-only, no rebuild**.

**B2. Optional local-LLM service behind a compose profile.** ⇐ B1
- File: [docker/docker-compose.yml](../../docker/docker-compose.yml) (+ optional `docker/docker-compose.gpu.yml` override)
- Add an `llm` service (Ollama default; note vLLM alternative) under `profiles: [local-llm]`, exposing an OpenAI-compatible endpoint on the internal network, with a `models`/`ollama-data` volume. Add a GPU override (`deploy.resources.reservations.devices` / `--gpus all`, NVIDIA Container Toolkit) and a CPU-only fallback note.
- Accept: `docker compose --profile local-llm up` starts the model server; with the local AI preset, an AI action completes and **no document content egresses** the host.

**B3. GPU / hardware guidance.** ⇐ B2
- File: `docs/DEPLOYMENT.md` (new AI section)
- Document minimum GPU/VRAM per recommended local model, NVIDIA Container Toolkit prerequisite, CPU-only expectations, and the privacy trade-off (Claude quality vs local privacy). Resolves the ROADMAP open question on local AI hardware.
- Accept: a reader can choose Claude vs local and, if local, size hardware and enable GPU from the doc alone.

### Group C — Documentation: modes, env reference, health/backup/upgrade

**C1. Re-point deployment docs to the product (both modes, end-to-end).** ⇐ A2, A5
- File: [docs/DEPLOYMENT.md](../DEPLOYMENT.md)
- Rewrite around `apps/web` (not demo) and the **self-hosted** stack (default), keeping Atlas/external-S3 as an alternative. Fully specify same-domain and separate-domain: build args, `BACKEND_URL`, CORS/`CLIENT_ORIGIN`, `BETTER_AUTH_URL`, OAuth redirect URIs on the backend domain, and cross-domain better-auth (`storeStateStrategy: database`, `skipStateCookieCheck: true`, cookie `sameSite`/`secure`). Provide a copy-paste same-domain quickstart.
- Accept: following the same-domain quickstart on a clean machine yields a working product login + collab edit.

**C2. Consolidated env reference.** ⇐ A5, B1
- File: [docs/DEPLOYMENT.md](../DEPLOYMENT.md) (or a linked `docs/CONFIG.md`)
- Publish the full §3 matrix (server + collab + storage + AI + web + infra) with defaults, required-vs-optional, and per-mode differences in one table.
- Accept: every var read by `config.ts` + Phase 4/7 + compose appears exactly once with purpose and default.

**C3. Health checks, backup & restore, upgrade runbook.** ⇐ A3, A6
- File: [docs/DEPLOYMENT.md](../DEPLOYMENT.md)
- **Health:** document each service's healthcheck + `/api/health` semantics. **Backup:** `mongodump` of the DB (incl. `collabstates` + `documents`) and `mc mirror` / bucket snapshot of MinIO — stress **both must be backed up together** to stay consistent. **Restore:** `mongorestore` + `mc mirror` back, with volume-mount steps. **Upgrade:** pull new image tags → `docker compose up -d` (rolling within single-host limits), how to pin versions, and a rollback note. Cover volume persistence guarantees.
- Accept: a dry-run backup→wipe→restore reproduces documents + collab state; upgrade steps change image tags without data loss.

**C4. Update CLAUDE.md deployment note.** ⇐ A2, A3
- File: [CLAUDE.md](../../CLAUDE.md) Deployment section
- Reflect the product stack (web+server+mongo+minio+optional llm), the single Dockerfile set, and both modes.
- Accept: the note matches the shipped compose.

### Group D — Licensing decision for on-prem distribution

**D1. Confirm and record the license model.** ⇐ none
- Files: [README.md](../../README.md), all `packages/*/package.json` + `apps/*/package.json`, new root `LICENSE`, [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) §5 (resolve the open question)
- **Finding to act on:** only `README.md:342` states "MIT"; **no `package.json` declares a `license` field and there is no `LICENSE` file**. Decide the model for on-prem distribution (e.g. MIT for the `packages/*` library vs a separate/commercial license for the `apps/web` product), then make it consistent: add `LICENSE` file(s), add `"license"` to every package.json, and record the decision + rationale in the roadmap.
- Accept: license is unambiguous and consistent across README, `LICENSE`, and every package.json; the roadmap open question is marked resolved.

**D2. Third-party / dependency license note.** ⇐ D1
- File: `docs/DEPLOYMENT.md` or `NOTICE`
- If distributing images, note bundled third-party licenses (Mongo SSPL, MinIO AGPL, Ollama/model licenses) so customers understand redistribution constraints of the *stack* vs our code.
- Accept: a short, accurate third-party license note ships with the distribution docs.

---

## 5. Sequencing

```
A1 ─► A2 ─┐
A3 ─► A4  ├─► A5 ─► A6
          │        │
Phase1 ─► A4       ├─► C1 ─► C2
Phase3 ─► A2       └─► C3
Phase4 ─► A3,A5
Phase7 ─► B1 ─► B2 ─► B3
B1 ─────► A5, C2
A2/A3 ──► C4
D1 ─► D2                      (independent; can land anytime)
```

Land **A (compose + images) first** — a working self-hosted stack is the backbone — then **B** (AI/local-LLM) and **C** (docs) in parallel, with **C3 backup/restore verified before declaring done**. **D (licensing)** is independent and should be resolved early since it's a release blocker, not a code dependency. The acceptance gate is the roadmap's: **a clean machine runs the full product from `docker compose up` following the docs alone.**

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Secrets in plaintext** (`.env.docker`, MinIO/Mongo creds, `BETTER_AUTH_SECRET`, `AI_API_KEY`) | Keep `.env.docker` in `.dockerignore` (already, [.dockerignore:8-10](../../.dockerignore)); document `openssl rand` generation, file perms, and Docker secrets / external secret-store as the production path; never bake secrets into images (web build args are public — only non-secret `VITE_*` there). |
| **GPU unavailable / driver mismatch** for local LLM | Local LLM is opt-in (`--profile local-llm`); Claude is the default and needs no GPU; document NVIDIA Container Toolkit prereq, CPU-only fallback, and VRAM sizing (B3). |
| **Cross-domain OAuth / cookies fail** (separate-domain) | Document mandatory better-auth `storeStateStrategy: database` + `skipStateCookieCheck: true`, `CLIENT_ORIGIN`/trustedOrigins, backend-domain redirect URI, HTTPS + `sameSite`/`secure` cookies (C1); mirrors existing [DEPLOYMENT.md:382-392](../DEPLOYMENT.md) troubleshooting. |
| **Backup/restore inconsistency across Mongo + MinIO** | Document that both stores must be backed up/restored **together**; provide a coordinated `mongodump` + `mc mirror` runbook and a verified dry-run (C3); objects referenced by docs must exist in MinIO. |
| **Data loss on upgrade** (volume handling) | Named volumes `mongo-data`/`minio-data` (A3); upgrade runbook only swaps image tags, never removes volumes; document `docker compose down` (not `down -v`) and pre-upgrade backup. |
| **Two Dockerfile sets drift** | Consolidate to one canonical set (A1). |
| **Stale `mongo-init.js`** breaks email/password users / misses Phase 1 store | Fix indexes (A4). |
| **AI provider misconfig leaks content** to external API in privacy-strict installs | Document the local preset clearly; verify no egress with local provider (B2 accept); make `AI_PROVIDER` explicit in env template (B1). |
| **Local-LLM resource starvation** on shared host | Profile-gated + documented resource reservations/limits; single-host assumption noted. |

## 7. Out of Scope (this phase)

- **Multi-instance horizontal scaling** (shared Yjs pub/sub, load-balanced server replicas, replica-set/sharded Mongo, distributed MinIO). On-prem is single-host, single-instance — consistent with Phase 1 §2.
- **Enterprise SSO** (SAML / OIDC / LDAP) — external OAuth + email/password only (roadmap decision).
- **Kubernetes / Helm charts / cloud-managed orchestration** — Docker Compose only.
- **Automated TLS termination inside the stack** — edge TLS remains the customer's host reverse proxy + Let's Encrypt.
- **Air-gapped installs** — on-prem is explicitly "self-hosted with internet."
- **RAG vector-store provisioning** (Phase 7E) beyond exposing its env; the datastore choice is tracked as a roadmap open question.
