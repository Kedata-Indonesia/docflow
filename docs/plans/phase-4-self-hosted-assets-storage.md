# Phase 4 — Self-hosted Assets & Storage · Task-Level Implementation Plan

**Roadmap ref:** [ENHANCEMENT_ROADMAP.md](../ENHANCEMENT_ROADMAP.md) Phase 4 · **Priority:** P1 · **Depends on:** Phase 2 · **Last updated:** 2026-07-17

> **Goal:** uploaded images/files live in **infrastructure the customer controls**. Add a
> storage service in `apps/server` with **S3-compatible (MinIO) as the primary target** and a
> **Mongo/GridFS fallback** for single-container installs, selected by env. An authenticated
> upload endpoint serves the `onImageUpload(file) => Promise<{ src }>` handler that Phase 2
> injected into the library. **No external CDN.**

---

## 1. Current State (what we're building on)

There is **no storage service today** — nothing in `apps/server` accepts or serves file bytes.

| Concern | State today | File |
|---------|-------------|------|
| Image insertion | Hardcoded placeholder + `window.prompt` for a URL; no upload | [packages/plugins/src/image.ts:5-24](../../packages/plugins/src/image.ts) |
| Default image src | `https://via.placeholder.com/300x200` (external URL) | [image.ts:5](../../packages/plugins/src/image.ts) |
| Upload injection point | **Added in Phase 2** — `onImageUpload(file) => Promise<{ src }>` threaded core→vue→element; not present yet | [ENHANCEMENT_ROADMAP.md:113](../ENHANCEMENT_ROADMAP.md) |
| Server routes | `documents`, `collab`, `users`, auth only — no `assets` | [index.ts:76-78](../../apps/server/src/index.ts) |
| Body size limit | `express.json({ limit: '10mb' })` — JSON only; no multipart parser | [index.ts:40](../../apps/server/src/index.ts) |
| Auth on routes | `requireAuth` reads the Better Auth session, sets `req.userId` | [middleware/auth-guard.ts:4-23](../../apps/server/src/middleware/auth-guard.ts) |
| Rate limiting | `apiLimiter` (global), `authLimiter` (auth) | [middleware/rate-limiter.ts:7-38](../../apps/server/src/middleware/rate-limiter.ts) |
| Config | Pure env-driven object; no storage keys | [config.ts:13-43](../../apps/server/src/config.ts) |
| Data model | Only `Document`; no `Asset` model | [models/Document.ts](../../apps/server/src/models/Document.ts) |
| Deploy | Compose has `server` + `demo`; Mongo commented-out; **no MinIO** | [docker/docker-compose.yml:1-78](../../docker/docker-compose.yml) |

**Key existing facilities we build on:**
- `requireAuth` gives every route `req.userId` from the Better Auth session ([auth-guard.ts:17](../../apps/server/src/middleware/auth-guard.ts)).
- Room/doc access is checked via `canAccessRoom` (`owner` or `collaborators`) ([index.ts:80-93](../../apps/server/src/index.ts)); the same ownership rule governs which docs an asset may attach to.
- Routes are mounted in one place ([index.ts:76-78](../../apps/server/src/index.ts)); adding `app.use('/api/assets', assetRoutes)` follows the pattern.
- Config is a single env-parsed object plus `getMongoClient()` for raw driver access ([config.ts:67-72](../../apps/server/src/config.ts)) — GridFS needs exactly this client/db handle.
- Env is documented in [docker/server.env.example](../../docker/server.env.example) and [.env.docker.example](../../.env.docker.example).

**Boundary note:** `apps/web` does not exist yet — it is created in Phase 3. This phase's
library-facing surface is the Phase 2 `onImageUpload` prop; the "wire to `apps/web`" task lands
the concrete handler in that app once it exists (see Group C dependency).

---

## 2. Target Architecture

```
  browser (editor)                         apps/server                         storage
 ┌──────────────┐   drop/paste image   ┌────────────────────────┐
 │ image plugin │ ───────────────────► │ onImageUpload handler   │
 │  (Phase 2)   │                      │  (apps/web, Group C)    │
 └──────────────┘                      └───────────┬────────────┘
        ▲                                           │  multipart POST (cookie auth)
        │  { src }                                  ▼
        │                              ┌────────────────────────────────────┐
        │                              │ POST /api/assets   (assets route)   │
        │                              │  requireAuth · MIME · size limit    │
        │                              └───────────┬─────────────────────────┘
        │                                          │  StorageAdapter.put(...)
        │                                          ▼
        │                              ┌────────────────────────────────────┐
        │                              │        StorageAdapter (iface)       │
        │                              │   selected by STORAGE_BACKEND env   │
        │                              └───────┬─────────────────┬───────────┘
        │                                      │                 │
        │                          STORAGE_BACKEND=s3   STORAGE_BACKEND=gridfs
        │                                      ▼                 ▼
        │                          ┌───────────────────┐  ┌────────────────────┐
        │                          │ MinIO / S3-compat │  │ Mongo GridFS bucket │
        │                          │ (own bucket)      │  │ (same datastore)    │
        │                          └───────────────────┘  └────────────────────┘
        │
        └───────── GET /api/assets/:id  ◄── server streams bytes from adapter.get()
                   (self-hosted URL; never a CDN)
```

**Design decisions:**

1. **One narrow adapter, two backends, env-selected.** `StorageAdapter` is the only contract the
   endpoint knows. `STORAGE_BACKEND=s3` (MinIO/S3-compatible, **primary**) or `gridfs` (Mongo,
   fallback for single-container installs). Adding a backend = a new adapter, no route changes —
   the same "one abstraction, config-driven selection" shape used for auth providers today.
2. **Prefer one datastore where reasonable.** GridFS reuses the existing Mongo connection
   (`getMongoClient()`), so a minimal install needs **only Mongo** — no second service. MinIO is
   the recommended production target when the customer wants object storage separated from the DB.
3. **The server serves bytes; no CDN, no public bucket.** Clients never talk to MinIO directly.
   The stored `src` is always a same-origin `/api/assets/:id` URL the server proxies. This keeps
   access control server-side and satisfies "self-hosted URL, no external CDN" (roadmap §4 Acceptance).
4. **Asset bytes are authoritative; metadata lives in Mongo.** An `Asset` document records
   ownership, MIME, size, and backend location. Bytes live in the chosen backend. This mirrors the
   Phase 1 split (authoritative store + Mongo metadata/read-model).
5. **The library stays backend-ignorant.** `packages/*` only ever sees the Phase 2
   `onImageUpload` prop. All storage code lives in `apps/server` (+ the handler in `apps/web`).

---

## 3. Data Model

New Mongoose model `Asset` ([apps/server/src/models/Asset.ts](../../apps/server/src/models/Asset.ts)):

```ts
interface IAsset {
  ownerId: string          // Better Auth user id (req.userId)
  docId?: string           // optional: document this asset was uploaded into (access scoping)
  filename: string         // original client filename (sanitized, display only)
  contentType: string      // validated MIME, e.g. "image/png"
  size: number             // bytes
  backend: 's3' | 'gridfs' // which adapter holds the bytes
  storageKey: string       // s3 object key OR gridfs file id — opaque to the route
  createdAt: Date
}
// index: { ownerId: 1, createdAt: -1 }
```

The stored image `src` returned to the editor is `/api/assets/<Asset._id>` — never the raw
bucket/GridFS location (which is internal, in `storageKey`).

Storage adapter interface ([apps/server/src/storage/StorageAdapter.ts](../../apps/server/src/storage/StorageAdapter.ts)):

```ts
export interface PutResult {
  storageKey: string       // opaque handle to persist on the Asset
  size: number
}

export interface StorageAdapter {
  readonly backend: 's3' | 'gridfs'
  /** Store bytes; returns the opaque key to record on the Asset. */
  put(input: {
    body: Buffer | NodeJS.ReadableStream
    contentType: string
    filename: string
  }): Promise<PutResult>
  /** Stream bytes back for GET /api/assets/:id (server proxies; no redirect to a CDN). */
  get(storageKey: string): Promise<{
    stream: NodeJS.ReadableStream
    contentType?: string
    size?: number
  }>
  /** Remove bytes (used when an Asset is deleted). */
  delete(storageKey: string): Promise<void>
}
```

Config additions ([config.ts](../../apps/server/src/config.ts)):

```ts
storage: {
  backend: (process.env.STORAGE_BACKEND || 'gridfs') as 's3' | 'gridfs',
  maxUploadBytes: parseInt(process.env.STORAGE_MAX_UPLOAD_BYTES || '10485760', 10), // 10MB
  allowedMimeTypes: parseCsv(process.env.STORAGE_ALLOWED_MIME
    || 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'),
  s3: {
    endpoint: process.env.S3_ENDPOINT || '',        // e.g. http://minio:9000
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'docflow-assets',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false', // MinIO needs path-style
  },
}
```

---

## 4. Task Breakdown

Tasks are grouped; each lists files, work, and acceptance. Dependencies noted as `⇐`.

### Group A — Storage abstraction & adapters (server core)

**A1. Storage config.** ⇐ none
- File: [apps/server/src/config.ts](../../apps/server/src/config.ts)
- Add the `storage` block from §3 and a `parseCsv` helper (mirror `parseOrigins` at [config.ts:5-11](../../apps/server/src/config.ts)). Extend `validateConfig()` ([config.ts:45-63](../../apps/server/src/config.ts)) to warn when `STORAGE_BACKEND=s3` but `S3_ENDPOINT`/keys/bucket are missing.
- Accept: booting with `STORAGE_BACKEND=s3` and empty keys logs a clear warning; default (`gridfs`) needs no extra env.

**A2. `StorageAdapter` interface.** ⇐ none
- File: `apps/server/src/storage/StorageAdapter.ts` (new) — the interface + `PutResult` from §3.
- Accept: file typechecks; no runtime code.

**A3. MinIO / S3 adapter (primary).** ⇐ A1, A2
- Files: `apps/server/src/storage/s3Adapter.ts` (new); add `@aws-sdk/client-s3` to [apps/server/package.json](../../apps/server/package.json) dependencies; `pnpm install`.
- `createS3Adapter(cfg)`: construct an `S3Client` with `endpoint`, `region`, `forcePathStyle`, and static creds. `put` → `PutObjectCommand` (key = `crypto.randomUUID()` + ext derived from `contentType`); `get` → `GetObjectCommand` returning the body stream + `ContentType`/`ContentLength`; `delete` → `DeleteObjectCommand`. `backend = 's3'`.
- Bucket bootstrap: on first use, `HeadBucket`; if missing, `CreateBucket` (guarded, so a fresh MinIO works out of the box). Keep the bucket **private** — never set a public-read ACL.
- Accept: unit/integration test against a local MinIO (or mocked S3 client) round-trips `put` → `get` bytes; object is not publicly reachable without the server.

**A4. GridFS adapter (fallback / single-container).** ⇐ A1, A2
- File: `apps/server/src/storage/gridfsAdapter.ts` (new). Uses `mongodb`'s `GridFSBucket` over `getMongoClient().db()` ([config.ts:67-72](../../apps/server/src/config.ts)) — **no new service or dependency** (the `mongodb` driver ships with `mongoose`).
- `put` → `openUploadStream(filename, { contentType })`, pipe body, resolve `storageKey = uploadStream.id.toHexString()`; `get` → `openDownloadStream(ObjectId(storageKey))` + read the `files` doc for `contentType`/`length`; `delete` → `bucket.delete(ObjectId(storageKey))`. `backend = 'gridfs'`.
- Accept: round-trips `put` → `get` against `mongodb-memory-server`; bytes match; a single-container install (Mongo only) works.

**A5. Adapter factory.** ⇐ A3, A4
- File: `apps/server/src/storage/index.ts` (new). `getStorageAdapter(): StorageAdapter` selects by `config.storage.backend`; construct once (singleton). Throw a startup-time error if `s3` selected but unconfigured (fail fast, don't 500 per request).
- Accept: switching `STORAGE_BACKEND` between `s3` and `gridfs` changes the adapter with no route/code change.

### Group B — Upload & serve endpoint (auth + limits)

**B1. `Asset` model.** ⇐ none
- File: `apps/server/src/models/Asset.ts` (new) — schema from §3, `{ ownerId, createdAt }` index.
- Accept: model compiles; `typecheck` passes.

**B2. Multipart parsing + size guard.** ⇐ A5
- File: `apps/server/src/routes/assets.ts` (new). Add `multer` (memory storage) to [package.json](../../apps/server/package.json) for `multipart/form-data`; **do not** raise the global `express.json` 10mb limit at [index.ts:40](../../apps/server/src/index.ts) — multipart bypasses the JSON parser. Configure multer `limits.fileSize = config.storage.maxUploadBytes`; handle the `LIMIT_FILE_SIZE` error → `413`.
- Accept: a file over the limit returns `413`, not a truncated write.

**B3. `POST /api/assets` (upload).** ⇐ A5, B1, B2
- File: `apps/server/src/routes/assets.ts`
- `requireAuth` ([auth-guard.ts](../../apps/server/src/middleware/auth-guard.ts)) → single-file `multer` middleware → handler:
  1. Validate `req.file.mimetype` ∈ `config.storage.allowedMimeTypes` (sniff magic bytes, not just the declared header — see Risks); reject `415` otherwise.
  2. Optional `docId` field: if present, verify the caller may write it (reuse the `owner`/`collaborators` rule from [index.ts:80-93](../../apps/server/src/index.ts)); else `403`.
  3. `adapter.put(...)` → create `Asset` with `ownerId = req.userId`, `backend`, `storageKey`, `size`, `contentType`, sanitized `filename`.
  4. Respond `201 { src: '/api/assets/' + asset.id }` — the shape Phase 2's `onImageUpload` resolves (`{ src }`).
- Accept: authenticated multipart upload of a PNG returns `{ src: "/api/assets/…" }` and creates one `Asset`; unauthenticated → `401`; disallowed MIME → `415`.

**B4. `GET /api/assets/:id` (serve).** ⇐ A5, B1
- File: `apps/server/src/routes/assets.ts`
- Load `Asset`; enforce access (see Risks — owner, or member of a doc the asset belongs to). `adapter.get(storageKey)` → set `Content-Type`, `Content-Length`, a long-lived immutable `Cache-Control` (keys are UUIDs, content-addressed by id), and pipe the stream. Handle missing key → `404`.
- Accept: an image `src` from B3 renders in the editor from a same-origin URL; a stranger cannot fetch another user's private asset.

**B5. Mount the route + rate limit.** ⇐ B3, B4
- File: [apps/server/src/index.ts](../../apps/server/src/index.ts)
- Add `app.use('/api/assets', assetRoutes)` alongside [index.ts:76-78](../../apps/server/src/index.ts). The global `apiLimiter` ([rate-limiter.ts:7](../../apps/server/src/middleware/rate-limiter.ts)) already covers it; add a **stricter per-user upload limiter** for `POST` only (uploads are heavier than reads).
- Accept: `/api/assets` is reachable; excessive uploads are throttled; GET (render path) is not blocked by the upload limiter.

### Group C — Library wiring & config/docs

**C1. Provide the `onImageUpload` handler in the app.** ⇐ B3
- File: `apps/web` editor mount (created in Phase 3; until then, prove the loop in `apps/demo` with a documented dev-only handler, or defer this task to land with Phase 3).
- Implement `onImageUpload(file)`: `POST /api/assets` as `multipart/form-data` with credentials (cookie session), return the `{ src }` from the response. Pass it into the `<DocsEditor>` / web-component `onImageUpload` prop added in Phase 2.
- Accept: dropping/pasting an image into the editor uploads it and renders from `/api/assets/:id`; **zero external network calls** (satisfies the roadmap boundary + Phase 2 acceptance).

**C2. Env examples + deployment docs.** ⇐ A1, A5
- Files: [docker/server.env.example](../../docker/server.env.example), [.env.docker.example](../../.env.docker.example), [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md)
- Document `STORAGE_BACKEND` (`gridfs` default vs `s3`), the `S3_*` keys, `STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_ALLOWED_MIME`. Explain the trade-off: GridFS = one datastore/single-container; MinIO = production object storage.
- Accept: a reader can enable either backend from the examples alone.

**C3. Optional MinIO compose service.** ⇐ A3, C2
- File: [docker/docker-compose.yml](../../docker/docker-compose.yml)
- Add a **commented-out** `minio` service (image, console/API ports, a persistent volume, healthcheck) mirroring the existing commented `mongo` block ([docker-compose.yml:54-78](../../docker/docker-compose.yml)), with a note to set `STORAGE_BACKEND=s3` + `S3_ENDPOINT=http://minio:9000`. Full turn-key wiring is Phase 8; this phase just provides the reference block.
- Accept: uncommenting `minio` + setting the env stands up S3-backed storage locally.

**C4. Update CLAUDE.md architecture note.** ⇐ B5
- File: [CLAUDE.md](../../CLAUDE.md)
- Add assets/storage to the `apps/server` routes list ([CLAUDE.md:76](../../CLAUDE.md)) and note the storage adapter (S3/GridFS, env-selected, server-proxied, no CDN).
- Accept: doc matches new reality.

### Group D — Tests & verification

**D1. Unit / adapter tests.** ⇐ A3, A4
- GridFS adapter round-trip against `mongodb-memory-server`; S3 adapter round-trip against a local MinIO or mocked S3 client; MIME magic-byte validator.

**D2. Endpoint integration tests.** ⇐ B3, B4, B5
- Authenticated upload → `{ src }` + one `Asset`; oversize → `413`; disallowed/spoofed MIME → `415`; unauthenticated → `401`; cross-user private GET → `403/404`; happy-path GET streams correct bytes + `Content-Type`.

**D3. E2E acceptance (the gate).** ⇐ C1
- File: `e2e/asset-upload.spec.ts` (new). Drop an image into the editor → it uploads to the configured backend and renders from a self-hosted `/api/assets/:id` URL; assert no request goes to any external host (no CDN). Run once with `gridfs` and once with `s3` if a MinIO service is available in CI.

---

## 5. Sequencing

```
A1 ─┬─► A3 ─┐
A2 ─┴─► A4 ─┴─► A5 ─► B2 ─► B3 ─┬─► B5 ─► C4
                          B1 ─┘   │
                B1 ─────────► B4 ─┘
A5 ─► B3/B4                       │
B3 ─► C1 ─► D3
A1/A5 ─► C2 ─► C3
A3/A4 ─► D1 ;  B3/B4/B5 ─► D2 ;  C1 ─► D3
```

Land **A (abstraction + both adapters) → B (endpoint) → D2** first with the `gridfs` default —
that proves the full loop on a single datastore with no new infra. Add the MinIO adapter path and
compose reference (C3) next, then wire the app handler (C1) — which formally lands with Phase 3's
`apps/web`. Do not gate the whole phase on `apps/web`: A/B/D2 are provable against the server alone.

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Large files / memory blow-up** | Multer `limits.fileSize` = `STORAGE_MAX_UPLOAD_BYTES` (B2) → `413`; **stream** to the adapter rather than buffering whole files where the backend supports it; keep the global `express.json` limit at 10mb — uploads use multipart, not JSON (B2). |
| **Auth on asset URLs** (private docs leaking via `/api/assets/:id`) | Serve **through the server**, never a public bucket or CDN (design decision 3); enforce access on GET (B4) using the same owner/collaborator rule as `canAccessRoom` ([index.ts:80-93](../../apps/server/src/index.ts)); UUID keys are unguessable but are **not** the access control. Keep MinIO bucket private + path-style (A3). |
| **MIME spoofing / malicious uploads** (e.g. SVG with embedded script, polyglots) | Validate against an allowlist by **sniffing magic bytes**, not the client-declared header (B3); serve with the correct `Content-Type` + `Content-Disposition`/`X-Content-Type-Options: nosniff`; treat `image/svg+xml` with caution (sanitize or gate behind config) since SVG can carry script. |
| **S3 misconfiguration silently falls back** | Fail fast at startup when `STORAGE_BACKEND=s3` but keys/endpoint/bucket are missing (A5) + `validateConfig` warning (A1) — never silently downgrade to GridFS. |
| **Two datastores complicate on-prem** | Default `gridfs` keeps single-container installs on **one datastore** (Mongo); MinIO is opt-in for customers who want object storage (roadmap "prefer one datastore where reasonable"). |
| **Orphaned bytes** (asset deleted / doc deleted) | `adapter.delete` exists (A3/A4); wire asset cleanup on document delete as a follow-up — noted, not blocking this phase (see Out of Scope). |

## 7. Out of Scope (this phase)

- **External CDN / signed public URLs** — explicitly excluded; the server always proxies bytes.
- **Image processing** — thumbnails, resizing, format transcoding, EXIF stripping.
- **Turn-key MinIO in the shipped compose** — Phase 8 (deployment packaging); this phase provides a commented reference block only.
- **Non-image file attachments** (arbitrary docs/PDFs) — the adapter is generic, but the endpoint MIME allowlist is image-first for now.
- **Garbage collection of orphaned assets** (unreferenced after edits) — a later maintenance job; `delete` support is in place.
- **`apps/web` product surface** — created in Phase 3; this phase only supplies the handler it calls (C1).
- **Multi-instance / shared-storage scaling** — single-server on-prem assumption, consistent with Phase 1 §2.
