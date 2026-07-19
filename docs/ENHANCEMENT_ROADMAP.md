# Enhancement Roadmap — DocsEditor

**Status:** Draft · **Owner:** Kedata Indonesia · **Last updated:** 2026-07-17

This document is the phased plan for evolving DocsEditor from "a library + a demo" into
**(1)** an embeddable, framework-agnostic editor library *and* **(2)** a first-party,
self-hostable web app ("our on-prem Google Docs"). It records the decisions behind the
plan so future work stays on the same track.

**Task-level plans** — each phase has a detailed, code-grounded implementation plan in [docs/plans/](plans/):

| Phase | Plan |
|-------|------|
| 0 — Boundary contract & guardrails | [phase-0-boundary-contract.md](plans/phase-0-boundary-contract.md) |
| 1 — Collaboration persistence | [phase-1-collab-persistence.md](plans/phase-1-collab-persistence.md) |
| 2 — Library injection points | [phase-2-library-injection-points.md](plans/phase-2-library-injection-points.md) |
| 3 — apps/web split | [phase-3-apps-web-split.md](plans/phase-3-apps-web-split.md) |
| 4 — Self-hosted assets & storage | [phase-4-self-hosted-assets-storage.md](plans/phase-4-self-hosted-assets-storage.md) |
| 5 — Export (PDF/DOCX) | [phase-5-export-pdf-docx.md](plans/phase-5-export-pdf-docx.md) |
| 6 — Citations & references | [phase-6-citations-references.md](plans/phase-6-citations-references.md) |
| 7 — AI assistance | [phase-7-ai-assistance.md](plans/phase-7-ai-assistance.md) |
| 8 — On-prem deployment packaging | [phase-8-deployment-packaging.md](plans/phase-8-deployment-packaging.md) |
| 9 — Google-Docs feature parity | [phase-9-google-docs-parity.md](plans/phase-9-google-docs-parity.md) |

---

## 1. Vision & Decisions

**Goal:** ship two products from one codebase without letting them entangle:

| Product | What it is | Who uses it |
|---------|-----------|-------------|
| **The library** (`packages/*`) | Embeddable rich-text editor with pagination + collaboration | Developers integrating into any app |
| **The web app** (`apps/web`) | Full document workspace (dashboard, auth, sharing, storage), self-hosted on-prem | Our own apps / on-prem customers |

**Decisions locked in (2026-07-17):**

| Decision | Choice | Consequence |
|----------|--------|-------------|
| On-prem strictness | **Self-hosted, has internet** | External OAuth & CDNs allowed; still prefer self-hostable defaults. Not air-gapped. |
| App structure | **Split: `apps/demo` + `apps/web`** | Demo stays a thin, backend-free library showcase; `apps/web` is the real product. |
| Auth model | **External OAuth + local email/password** | No enterprise SSO (SAML/LDAP) in scope yet. |
| First priority | **Collaboration persistence** | Phase 1 below; fix data-integrity before adding features. |

### The one architectural principle

> **The library must know nothing about the backend.** Persistence, auth, and storage are
> the host app's job, reached only through narrow injectable interfaces. Everything
> backend-specific (Mongo, better-auth, sharing, folders, object storage) lives in
> `apps/server` / `apps/web`, never in `packages/*`.

A change that respects this principle touches either the library *or* the app — rarely both.

---

## 2. Phase Overview

| Phase | Theme | Layer | Priority | Depends on |
|-------|-------|-------|----------|------------|
| **0** | Boundary contract & guardrails | Docs / lib | P0 | — |
| **1** | Collaboration persistence (data integrity) | Server | **P0** | 0 |
| **2** | Library boundary completion (injection points) | Library | P0 | 0 |
| **3** | `apps/web` split — first-party product | App | P1 | 1, 2 |
| **4** | Self-hosted assets & storage | Server / App | P1 | 2 |
| **5** | Export (PDF / DOCX) | Library / App | P1 | 2 |
| **6** | Citations & references (Chicago/CSL) | Library / App | **P1** | 2, 3, 5 |
| **7** | AI assistance (pluggable LLM) | Server / Library / App | **P1** | 2, 3 |
| **8** | On-prem deployment packaging | Infra | P1 | 1, 3, 4, 7 |
| **9** | Google-Docs feature parity | Library / App | P2 | 3 |

Phases 1 and 2 are independent and can run in parallel. Phase 3 assumes both are done.
The Phase 6 citation *engine* (library-side) can start right after Phase 2; its *reference
library* (app-side) needs Phase 3, and cited **export** needs Phase 5. The Phase 7 AI
*provider abstraction + inline transforms* can start after Phase 2; its **cited/RAG drafting**
stage needs Phase 6.

---

## 3. Phases

### Phase 0 — Boundary contract & guardrails
**Goal:** make the library/app boundary explicit so it can't erode silently.

**Scope**
- Document the library's injection interfaces (the "ports" a host app implements):
  - `onUpdate(json)` — persistence hook (exists)
  - `collaboration` — provider config (exists)
  - `onImageUpload(file) => Promise<url>` — asset upload (to add in Phase 2)
  - export hooks (to add in Phase 5)
- Add a short "Do not import backend concerns into `packages/*`" note to `CLAUDE.md` and `AGENTS.md`.
- (Optional) lint guard: forbid `packages/*` from importing `apps/*` or server-only deps.

**Deliverables:** [docs/LIBRARY_CONTRACT.md](LIBRARY_CONTRACT.md); updated `CLAUDE.md`, `AGENTS.md`, `.eslintrc.cjs` (lint guardrail).
**Acceptance:** the contract lists every injection point with types; no `packages/*` file imports from `apps/*`.

---

### Phase 1 — Collaboration persistence (data integrity) · **P0, do first**
**Goal:** make the Yjs document the single durable source of truth so on-prem installs never lose or diverge edits.

**Problem (today):** three uncoordinated persistence paths exist and can diverge —
`Document.content` (TipTap JSON via `onUpdate`/`auto-save`), `CollabSnapshot.yDocState`
(client-posted binary), and the live in-memory ydoc on the websocket server. The websocket
server ([apps/server/src/y-websocket/utils.cjs](../apps/server/src/y-websocket/utils.cjs))
does **not** persist server-side — a restart with no client mid-save loses edits.

**Scope**
- Write a **Mongo-backed Yjs persistence adapter** and wire it into `setPersistence({ bindState, writeState })` in `utils.cjs`.
  - `bindState(roomId, ydoc)` — load stored `yDocState` from Mongo, apply to the ydoc on first room connection.
  - `writeState(roomId, ydoc)` — debounced + on-last-client-disconnect: encode ydoc → upsert to Mongo; in the same write, derive `content` (TipTap JSON) + `plainText` and update the `Document`.
- Make **Yjs binary authoritative**; **TipTap JSON becomes a derived read-model** (dashboard list, search, export) — never the edit source for collaborative docs.
- **Retire client-driven paths** for collaborative docs: `POST /api/collab/snapshot`, `POST /api/collab/auto-save`, and content-saving via `onUpdate`. (`onUpdate` stays for single-user, non-collaborative docs.)
- Migration: backfill `CollabSnapshot`/`Document.content` into the new authoritative store on first load.

**Deliverables:** Mongo persistence adapter; updated `utils.cjs` wiring; migration script; removed/deprecated legacy routes.
**Acceptance (verify end-to-end):**
- Two clients edit the same room; edits converge.
- Restart the server with no clients connected → reconnecting client sees the last state (no loss).
- `Document.content` always matches the ydoc after a debounced write.
- Only one datastore (Mongo) is required.

---

### Phase 2 — Library boundary completion (injection points) · P0
**Goal:** remove backend assumptions leaking into the library.

**Scope**
- **Image/file upload injection.** Replace the `window.prompt` + `via.placeholder.com` default in [packages/plugins/src/image.ts](../packages/plugins/src/image.ts) with an injectable `onImageUpload(file) => Promise<{ src }>` handler. Library never hardcodes a storage location; falls back to a URL prompt only when no handler is provided.
- **Collaboration defaults safe for self-host.** In [packages/core/src/Collaboration.ts](../packages/core/src/Collaboration.ts), stop defaulting webrtc signaling to public servers (`signaling.yjs.dev`, `y-webrtc-eu.fly.dev`); require explicit config, and document websocket + own-server as the production path.
- Audit `packages/*` for any remaining external URLs / backend assumptions.

**Deliverables:** `onImageUpload` prop threaded through core → vue → element; safer collab defaults.
**Acceptance:** editor runs with zero external network calls when configured for websocket + local upload handler; demo still works with defaults.

---

### Phase 3 — `apps/web` split (first-party product) · P1
**Goal:** a real, self-hostable web app, separate from the library showcase.

**Scope**
- Create `apps/web` as the product: dashboard, editor view, sharing, folders, starred, search — built on the published packages.
- Slim `apps/demo` back to a **backend-free** showcase (webrtc/local only, `defaultPlugins`, no auth/Mongo) so it stays useful to library consumers.
- Wire `apps/web` to `apps/server` (auth, documents, collab).
- Auth: polish **external OAuth (Google/GitHub/Microsoft) + local email/password**; ensure email/password is a first-class, documented option (currently off by default).

**Deliverables:** `apps/web` app; trimmed `apps/demo`; updated `pnpm-workspace.yaml`, dev scripts, `playwright.config.ts`.
**Acceptance:** `pnpm --filter ...web dev` runs the full product against the server; `pnpm dev` (demo) runs with no backend.

---

### Phase 4 — Self-hosted assets & storage · P1
**Goal:** uploaded images/files live in infrastructure the customer controls.

**Scope**
- Add a storage service in `apps/server`: **S3-compatible (MinIO)** as the primary target, with a Mongo/GridFS fallback for single-container installs.
- Implement the upload endpoint that `apps/web`'s `onImageUpload` handler (Phase 2) calls.
- Config-driven backend selection via env; document in `.env` examples and deployment docs.

**Deliverables:** storage abstraction + endpoint; MinIO + GridFS adapters; env config.
**Acceptance:** an image dropped into the editor uploads to the configured store and renders from a self-hosted URL; no external CDN required.

---

### Phase 5 — Export (PDF / DOCX) · P1
**Goal:** Google-Docs-grade document export.

**Scope**
- **PDF:** leverage the existing pagination model (`layout-engine`) for print-accurate, paginated PDF (print CSS or headless-browser render).
- **DOCX:** map the ProseMirror/TipTap schema to DOCX (headings, lists, tables, images, alignment).
- Expose as library export hooks + an `apps/web` "Download as…" action.

**Deliverables:** export module; UI action; format fidelity tests.
**Acceptance:** a multi-page document exports to PDF with correct page breaks, and to DOCX preserving structure.

---

### Phase 6 — Citations & references (Chicago / CSL) · **P1, headline feature**
**Goal:** academic-grade citations and bibliography with real style support, driven by structured source data — not formatted strings.

**Decisions (2026-07-17):**
- **Source records:** a **reusable reference library** — sources stored app-side (per-user, shareable, searchable), referenced from documents by id.
- **Styles:** use **CSL (Citation Style Language) + citeproc-js**. "Chicago style" = loading a CSL file; ~2,600 styles (APA, MLA, IEEE, Turabian…) come for free. **Support both** Chicago systems (notes-bibliography *and* author-date).
- **Import:** manual entry form, DOI/URL lookup (CrossRef), BibTeX/RIS import. **Zotero integration is deprioritized** — deferred to a later, separately-scoped effort (heaviest importer; depends on Zotero's API/auth model).

**Core principle:** a citation node stores `{ sourceId, locator }`, never rendered text.
citeproc-js derives all in-text citations + the bibliography from source metadata (CSL-JSON)
+ the active CSL style. Changing the style, or editing a source, re-renders everything —
the same "single source of truth, derived view" pattern used for pagination and collab.

**Connection to existing work:** the current [footnote node](../packages/plugins/src/footnote.ts)
stores `content` as a plain string. Chicago notes-bibliography reuses the footnote mechanism,
but the footnote must be extended to optionally hold a `sourceId` so it reformats with style.

**Boundary split:**
- **Library** (`packages/plugins` + engine wrapper): citation inline node, extended footnote node, bibliography node, citeproc-js wrapper, CSL style loading. A new `citationPlugin`. Docs carry an **embedded source snapshot** so they render standalone/offline.
- **App** (`apps/server` + `apps/web`): the reference-library CRUD, search, sharing, and all importers (CrossRef, BibTeX/RIS, Zotero).

**Stages**
- **6A — Citation engine (library):** citation node schema (`sourceId` + locator), extended footnote node, bibliography node, citeproc-js wrapper, bundle Chicago (notes-bib + author-date) + APA/MLA CSL styles. Style switch re-renders live. *Can start after Phase 2.*
- **6B — Reference library (app):** `Source` model (CSL-JSON), CRUD API, `apps/web` reference-manager UI, insert-citation flow, per-doc embedded snapshots. *Needs Phase 3.*
- **6C — Importers (app):** manual form → DOI/URL (CrossRef) → BibTeX/RIS → Zotero, in that order.
- **6D — Cited export:** ensure citations + bibliography render correctly in PDF/DOCX. *Needs Phase 5.*

**Deliverables:** `citationPlugin`; citeproc-js engine wrapper + bundled CSL styles; `Source` model + API; reference-manager UI; importers; cited export.
**Acceptance:**
- Insert a source, cite it in-text and as a footnote; both render per the active style.
- Switch Chicago ↔ APA → every citation and the bibliography reformat automatically.
- Edit a source's metadata → all its citations update.
- Import via DOI and BibTeX; a document exports to PDF/DOCX with correct citations + bibliography.

---

### Phase 7 — AI assistance (pluggable LLM) · **P1, headline feature**
**Goal:** AI writing help — inline transforms, generation, chat, and cited drafting — with the LLM provider chosen per deployment (Claude API *or* self-hosted local).

**Decisions (2026-07-17):**
- **Provider strategy:** one **provider abstraction**, default **Claude API**, with a self-hosted **local** path via an **OpenAI-compatible endpoint** (Ollama / vLLM / LM Studio). Chosen per deployment by env config, no code change.
- **Data privacy:** **configurable per customer** — some allow external API, some require local-only. This is *why* the abstraction is mandatory, not optional.
- **Scope:** all four capabilities are in scope (inline transforms, generative at cursor, doc-aware chat, cited/RAG drafting).

**Current state:** [AISidebar.vue](../packages/vue/src/components/sidebars/AISidebar.vue) calls
`/api/ai/copilot`, but **no such server route exists** — AI is a UI stub. It also has the
wrong shape to keep: non-streaming, sends the whole document each call, inserts plain text
(bypassing the transaction model), and has no provider abstraction. Treat as a clean slate.

**Non-negotiables:**
- **Never call an LLM from the browser.** The editor calls the server; the server calls the LLM (keeps keys server-side, enables provider swap, RAG, auth + rate limits).
- **AI edits are applied as ProseMirror transactions**, never raw text injection — so they flow through Yjs like any human edit (single source of truth, no divergence).
- **Library exposes AI *actions* (a new `aiPlugin`); the app supplies the *provider*.**

**Provider matrix:**

| Provider | Reach | Data leaves premises? | Use |
|----------|-------|----------------------|-----|
| **Claude** (Sonnet 5 workhorse, Haiku 4.5 fast/cheap, Opus 4.8 heavy) | needs internet | yes | default, best quality |
| **OpenAI-compatible local** (Ollama / vLLM) | self-hosted | no | privacy-strict customers |
| **OpenAI / other API** | needs internet | yes | alternative hosted |

Config: `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`. One OpenAI-compatible adapter
covers local + OpenAI; one native Claude adapter for best quality.

**Stages**
- **7A — Provider abstraction + server AI route (`apps/server/routes/ai.ts`):** `AIProvider` interface (`stream()`/`complete()`), Claude + OpenAI-compatible adapters, **SSE streaming**, config-driven selection, auth + rate limiting (infra exists), scoped context assembly (send selection + surrounding, not the whole doc). Replaces the stub. *Can start after Phase 2.*
- **7B — Inline transforms (library `aiPlugin`):** bubble-menu selection actions — rewrite, summarize, fix grammar, change tone, translate, expand/shorten — streamed, applied as PM transactions. Highest value / lowest complexity.
- **7C — Generative at cursor:** slash `/ai <prompt>` to draft/continue, streamed as ghost text, accept/reject.
- **7D — Chat sidebar (doc-aware):** upgrade `AISidebar` to streaming, doc-grounded Q&A and agentic edits.
- **7E — Cited AI drafting (RAG):** embeddings provider (pluggable, local or API) + vector store over the Phase 6 reference library + document; grounded generation that inserts proper Phase 6 citations. *Needs Phase 6.*

**Deliverables:** provider abstraction + adapters; SSE AI route; `aiPlugin` (inline + generative); upgraded chat sidebar; RAG pipeline + vector store; env config + docs.
**Acceptance:**
- Switch `AI_PROVIDER` from Claude to a local Ollama endpoint with only env changes; both work.
- Select text → "improve" streams a replacement applied as a transaction; works inside a collaborative session without divergence.
- `/ai` generates at the cursor with streaming accept/reject.
- With local provider configured, no document content leaves the network.
- RAG drafting cites real sources from the reference library.

---

### Phase 8 — On-prem deployment packaging · P1
**Goal:** a customer can stand up the whole stack on their own hardware.

**Scope**
- Turn-key `docker-compose` (web + server + Mongo + MinIO) building on the existing `docker/` configs.
- **AI provider config** in the deployment: `AI_PROVIDER` selection + an optional local-model profile (Ollama/vLLM container, GPU notes) for privacy-strict installs.
- Document both deployment modes (same-domain / separate-domain) end-to-end for the product (not just the demo).
- Consolidated env reference; health checks; upgrade/backup notes.
- Confirm the **licensing model** for on-prem distribution (packages currently declare MIT).

**Deliverables:** production compose + docs; env reference; licensing decision recorded.
**Acceptance:** a clean machine runs the full product from `docker compose up` following the docs alone.

---

### Phase 9 — Google-Docs feature parity · P2
**Goal:** close the gap to a Docs-class experience. Prioritize within the phase later.

**Candidate scope (not committed):** version history / named versions, comments & suggestions,
live TOC, real-time presence polish, templates, offline editing, permission roles
(viewer/commenter/editor) beyond the current `collaborators[]` array.

**Acceptance:** defined per feature when scheduled.

---

## 4. Cross-Cutting Concerns

- **Verification gate (every phase):** lint → typecheck → unit → e2e (if UI/layout changed) → build for affected packages, per [AGENTS.md](../AGENTS.md).
- **Boundary rule:** any PR touching both `packages/*` and `apps/*` for the same concern is a smell — re-check the injection contract.
- **Data safety:** Phase 1 lands before any feature that increases write volume to documents.

## 5. Open Questions

- Licensing for on-prem distribution (resolve in Phase 8).
- Whether comments/versioning (Phase 9) should be Yjs-native or separate collections.
- Enterprise SSO (SAML/OIDC/LDAP) — out of scope now; revisit if customers require it.
- **AI RAG (Phase 7E):** embeddings provider (local vs API) and vector store choice — Mongo Atlas Vector Search, `pgvector`, or a self-hosted store — must fit the one-datastore-for-on-prem preference.
- **Local AI hardware:** minimum GPU/model spec to recommend for privacy-strict installs (quality vs cost trade-off).
- **AI abuse/cost controls:** per-user token quotas and rate limits for hosted (API) deployments.
