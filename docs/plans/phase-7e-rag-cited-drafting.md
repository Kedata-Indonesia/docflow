# Phase 7E — Cited AI Drafting (RAG) · Task-Level Implementation Plan

**Roadmap ref:** [phase-7-ai-assistance.md](phase-7-ai-assistance.md) Group 7E · **Depends on:** Phase 6 (reference library + citation nodes) ✅, 7A (provider abstraction + SSE route) ✅ · **Status:** READY (review round 2026-07-24 folded in) · **Last updated:** 2026-07-24

> **Goal:** the user asks the AI sidebar to draft text **grounded on their reference
> library** (Phase 6 `Source` records). The server retrieves the most relevant sources
> via vector search, streams a draft whose claims carry `[n]` markers, and the client
> inserts the draft **with live Phase 6 citation nodes** (`{ sourceId, locator }`) as
> **one ProseMirror transaction** — so citeproc renders them per the active CSL style
> and they converge in collab rooms like any other edit.

---

## 0. Decisions locked with the team (2026-07-24)

| Question | Decision | Note |
|----------|----------|------|
| Embeddings provider | **OpenAI `text-embedding-3-small`** via the existing `openai-compatible` adapter | Reuses `AI_API_KEY` + `AI_BASE_URL` — zero new credentials. **Correction to the phase-7 plan:** Anthropic has no embeddings API; `AI_EMBED_PROVIDER=claude` was never viable. Local/privacy path stays possible: any OpenAI-compatible embedding endpoint (Ollama `nomic-embed-text`) via `AI_EMBED_BASE_URL`. |
| Vector store | **Application-side cosine scan over `source_chunks` (default)** — Atlas Vector Search optional | **Revised 2026-07-24 (quota constraint + self-hosted story):** the team could not create an Atlas Vector Search index (limited quota), and Atlas-only retrieval would never work on self-hosted Mongo Community. The corpus is a per-user reference library (tens–hundreds of sources), so scanning the owner's chunks and scoring cosine in Node is milliseconds-cheap. `AI_RAG_VECTOR_BACKEND=scan|atlas` (default `scan`); the Atlas `$vectorSearch` store remains as the scale-out backend behind the same `VectorStore` seam. |
| Embedding scope (MVP) | **Reference-library `Source` records only** | The phase-7 plan also mentions document chunks; doc context is already covered by the existing bounded-context mechanism (7A-4). Doc-chunk indexing is explicitly deferred (§7). |
| Draft surface | **AI sidebar** (7D) — new "Draft with citations" action | Reuses the 7D chat UI + `aiStream` transport. No new sidebar. |
| Citation insertion | **Client-side marker → citation node mapping** | Server returns the `[n]` → `sourceId` map in the SSE `done` event; the library never trusts model-invented ids — it only maps markers through the server-provided table. |
| **RAG scoping (review 2026-07-24)** | **Owner ∪ shared-with-user sources** | A shared/collab document shares its sources too: `Draft with citations` grounds on sources the user **owns OR that are shared with them** — matches the Phase 6 visibility (`GET /api/sources` already returns `$or:[{owner},{sharedWith}]`). Vector filter and hydration both use the same predicate; never owner-only. |
| **Citation rendering in collab (review 2026-07-24)** | **Inherit Phase 6's `Document.sources` snapshot** | Every collaborator renders the same citations: the existing `CitationEngineExtension.onUpdate` walks the doc after every transaction, calls `onSourcesChange` → the host persists cited sources' CSL to `Document.sources`; peers render from that snapshot. **7E does NOT build a new rendering path** — it relies on this. (Caveat: the snapshot is REST-persisted, not Yjs-synced, so realtime peers may render `?` briefly until the PUT propagates. This is the *pre-existing* Phase 6 behavior for manual citation inserts, **not a 7E regression**, and 7E must not make it worse — see §6.) |
| **Insert mechanism (review 2026-07-24)** | **Single `view.dispatch(tr.insertContent(array))` — NOT `insertCitation` repeated** | The plan's earlier "reuse `insertCitation` per marker within the same transaction batch" is **wrong**: `insertCitationWithSource` (`packages/plugins/src/citation.ts` `:221-248`) calls `editor.chain().focus().insertContent({...}).run()` — each call dispatches its **own** transaction (N markers → N dispatches → N Yjs history entries). 7E-4 instead builds one content array (text spans + inline `citation` nodes, OR `footnote` nodes for note styles) and inserts once via `view.dispatch`. The engine's `onUpdate` then walks the doc and runs the snapshot persist — the content-array path does **not** bypass the snapshot mechanism. |
| **Vector store seam (review 2026-07-24)** | **Atlas-only for MVP, but `VectorStore` interface ships now** | The umbrella phase-7 plan promised a `VectorStore` seam so non-Atlas backends (pgvector/Qdrant/Milvus) can plug in later for self-hosted customers. §3's earlier draft inlined `$vectorSearch` directly and dropped the seam — which silently hard-disables 7E on plain Mongo Community (no vector search capability) with only a 503. **Fix:** ship a thin `VectorStore` interface now with the Atlas implementation as the only backend; non-Atlas support stays out of scope (§7) but the seam makes the "later" honest and degrades gracefully (503 "vector store not configured for this backend"). |

---

## 1. Current State (what we build on)

- **7A spine exists:** `AIProvider` + adapters, `POST /api/ai/complete` (SSE `delta`/`done`/`error`), `aiLimiter`, scoped `buildMessages`, `aiStream` client transport.
- **Phase 6 exists:** `Source` collection (owner-scoped CSL-JSON), `citationPlugin` with
  `insertCitation` command (`{ sourceId, locator? }` → citation node or citation-backed
  footnote for note styles), `CiteEngine` renders derived text, export (PDF/DOCX) resolves citations.
- **7D sidebar exists:** conversation UI, streaming, macros, insert-as-transaction.
- **7E server stubs:** `AIActionRequest.action: 'draft'` is a known action; `buildMessages` currently throws "not implemented yet (Phase 7E)" → route returns 400.

---

## 2. Target Architecture

```
 AI sidebar ("Draft with citations")
   │  aiDraft({ prompt, documentId? })            (new client transport fn, sibling of aiStream)
   ▼
 POST /api/ai/draft  (requireAuth + aiLimiter)
   │  1. embed(query)            ──► EmbeddingProvider (OpenAI text-embedding-3-small)
   │  2. $vectorSearch(k=6)      ──► source_chunks collection (owner ∪ sharedWith filter)
   │  3. hydrate Source docs     ──► sources collection (CSL-JSON snapshots)
   │  4. grounded prompt         ──► system: cite-with-[n] rules; user: numbered snippets + request
   │  5. provider.stream()       ──► SSE delta events (text with [n] markers inline)
   │  6. SSE done event          ──► { citations: [{ ref: 1, sourceId, label }], usage }
   ▼
 Client (library):
   - streams text into the sidebar turn like any chat answer
   - "Insert" parses [n] markers through the done-event citation table and inserts
     text + citation nodes via insertContent — ONE ProseMirror transaction
     (note styles → citation-backed footnotes automatically, per citationPlugin)

 Indexing (background, fire-and-forget):
   sources route create/update/import ──► embedSource(source) ──► upsert source_chunks
   sources route delete               ──► deleteMany({ sourceId })
```

**Design decisions (7E-specific):**

1. **Markers, not ids, in the generated text.** The model writes `[1]`, `[2]`… referring to
   the numbered snippets it was shown. The server owns the `n → sourceId` table and returns
   it in `done`. Rationale: model output is untrusted — a hallucinated `sourceId` can never
   reach the document; only markers that resolve through the table become citations.
2. **Owner-or-shared scoping is a hard filter, not a prompt instruction.** `$vectorSearch.filter`
   uses the **owner-visibility predicate** — `{ $or: [{ ownerId: userId }, { sharedWith: userId }] }` —
   (and the hydration query re-checks the **same** predicate, mapped to `Source.owner` /
   `Source.sharedWith`). Matches Phase 6 visibility (`GET /api/sources` already returns
   `$or:[{owner},{sharedWith}]`); a collaborator drafting in a shared doc must retrieve
   sources shared with them, not only their own. Prompt-injection hygiene per the phase-7
   risk table: snippets go in the user role, citation rules in the system role.
3. **Graceful degradation.** Embeddings not configured → route returns 503 with a clear
   message (same pattern as 7A-5). Vector index missing → detect the Atlas error, log
   setup guidance once, return 503. The rest of the AI features keep working.
4. **One chunk per source for MVP.** CSL-JSON sources are small (title + authors + year +
   container + abstract ≤ ~2k chars). We build ONE retrieval document per source
   (`title — authors (year), container. abstract`) — no chunk splitting, no overlap
   machinery. The `source_chunks` schema still carries `chunkIndex` so multi-chunk can
   be added without a migration (§7).
5. **Indexing is fire-and-forget after source writes.** Source create/update/import
   responses do not wait for embedding; a failed embedding logs a warning and leaves the
   source searchable by nothing (acceptable: next edit retries). No queue/worker for MVP.
6. **Insert-as-one-transaction, via a content array — NOT via repeated `insertCitation`.**
   The sidebar builds a ProseMirror content array (text spans + inline `citation` nodes,
   OR `footnote` nodes for note styles) and dispatches a single
   `view.dispatch(state.tr.insertContent(array))`. The earlier "reuse `insertCitation`
   per marker within the same transaction batch" framing was **provably false**:
   `insertCitationWithSource` (`citation.ts:221-248`) calls `editor.chain().focus().insertContent({...}).run()` —
   *each* invocation dispatches its own transaction (N markers → N dispatches → N Yjs
   history entries). Building the array once and dispatching once is the correct path.
   To avoid the sidebar duplicating the note-vs-inline node construction, expose a small
   pure helper from `citation.ts`: `buildCitationNodes(engine, { sourceId, locator })`
   returning the right node spec (`citation` vs `footnote` per `engine.isNoteStyle()`);
   the sidebar calls it per marker, packs results + text spans into one array, and
   `insertContent`s once. The `CitationEngineExtension.onUpdate` walk then fires on this
   dispatch exactly as for a manual insert → `onSourcesChange` → snapshot persist runs
   (so the Phase 6 rendering/collab path is NOT bypassed).

---

## 3. Data Model / Interfaces

### 3.1 Embeddings provider (`apps/server/src/ai/rag/embeddings.ts`, new)

```ts
interface EmbeddingProvider {
  /** One vector per input text; consistent dimension across calls. */
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>
  /**
   * The EFFECTIVE vector length this provider returns/requests — set from
   * `AI_EMBED_DIMENSIONS` (default 1536). NOT the model's native max; if a deployment
   * shortens OpenAI `text-embedding-3-small` to 768 via `AI_EMBED_DIMENSIONS=768`, this
   * reads 768 and the request body carries `dimensions: 768`. Must equal the Atlas
   * index `numDimensions` (§3.3) and the server-side `VECTOR_INDEX_NUM_DIMENSIONS`
   * config (§3.1) — boot warns on mismatch.
   */
  readonly dimensions: number
}
```

- **OpenAICompatibleEmbeddingProvider**: `POST ${AI_EMBED_BASE_URL || AI_BASE_URL}/embeddings`
  `{ model: AI_EMBED_MODEL, input: texts }` → `data[].embedding`. Same auth rule as the
  completion adapter (`Authorization: Bearer` only when key non-empty). Covers hosted
  OpenAI AND local Ollama (`AI_EMBED_BASE_URL=http://localhost:11434/v1`,
  `AI_EMBED_MODEL=nomic-embed-text`, native 768 — set `AI_EMBED_DIMENSIONS=768`).
  **Request body `dimensions` handling:** send `dimensions: <this.dimensions>` IFF the
  provider accepts a shorten `dimensions` param (OpenAI `text-embedding-3-*` does). For
  fixed-dimension backends (Ollama `nomic-embed-text`), omit the param and ensure
  `AI_EMBED_DIMENSIONS` equals the backend's native length — a request `dimensions`
  mismatched to the index is a hard 503 class of bug (§6).
- `getEmbeddingProvider()` memoized, mirrors `getProvider()`. Boot compares
  `AI_EMBED_DIMENSIONS` against the server-side `VECTOR_INDEX_NUM_DIMENSIONS` config
  (default 1536, mirroring the §3.3 index JSON) and warns on mismatch.
- Config addition (`config.ts`): `ai.embeddings: { baseUrl, model, apiKey (falls back to AI_API_KEY), dimensions }`
  with `AI_EMBED_BASE_URL` / `AI_EMBED_MODEL` (default `text-embedding-3-small`) /
  `AI_EMBED_API_KEY` / `AI_EMBED_DIMENSIONS` (default 1536).

### 3.2 `source_chunks` collection (new, Mongo)

```ts
{
  _id: ObjectId,
  sourceId: string,        // Source._id
  ownerId: string,         // Source.owner — indexing owner here for fast $vectorSearch filter
  sharedWith: string[],    // mirrored from Source.sharedWith so the visibility
                           //   predicate { $or:[{ownerId},{sharedWith}] } is a single-stage filter
  chunkIndex: number,      // always 0 in MVP (multi-chunk future)
  text: string,            // the retrieval document (also shown to the model), capped ~1800 chars
  vector: number[],        // dimensions per config (must match the Atlas index numDimensions)
  updatedAt: Date
}
```

**Field-mapping note:** the Phase 6 `Source` model field is **`owner`** (not `ownerId`)
and sources carry **`sharedWith: string[]`**. The chunk collection mirrors both so the
vector-search filter is one stage: `{ $or: [{ ownerId: userId }, { sharedWith: userId }] }`.
The indexer (`sourceIndexer.ts`) copies `owner`/`sharedWith` from the `Source` on every
embed; on `Source` share and on the new unshare route (see §4 7E-2 — `POST /api/sources/:id/share`
plus the 7E-added `DELETE /api/sources/:id/share/:userId`) the sharedWith mirror on chunks must be
re-mirrored (re-embed not required — a metadata-only upsert of `sharedWith` suffices).
The hydration query re-checks `Source.owner`/`Source.sharedWith` (defense in depth, since
vector results already came back filtered — the re-check guards against a stale-chunk
mirroring race).

Plain indexes: `{ sourceId: 1 }` (delete-by-source), `{ ownerId: 1 }`.

### 3.2.bis `VectorStore` seam (new, ships with MVP — review 2026-07-24)

```ts
interface VectorStore {
  /** Upsert one chunk per source. ownerId/sharedWith mirrored from Source. */
  upsert(record: SourceChunkRecord): Promise<void>
  /** `$vectorSearch` (Atlas) with the owner-visibility predicate applied. */
  query(
    vector: number[], k: number, scope: { userId: string },
    signal?: AbortSignal,
  ): Promise<SourceChunkHit[]>
  deleteBySource(sourceId: string): Promise<void>
}
```

A thin interface so non-Atlas backends (pgvector / Qdrant / Milvus) can plug in later
without touching the route — the umbrella phase-7 plan promised this seam.

**Backends shipped (revised 2026-07-24 — Atlas quota constraint):**

- **`ScanVectorStore` (default, `AI_RAG_VECTOR_BACKEND=scan`)** — loads the
  caller-visible chunks with a plain Mongo query (`$or: [{ ownerId }, { sharedWith }]`,
  the same owner-visibility predicate), scores cosine similarity in Node, returns
  top-`k`. O(chunks-per-user × dims) — single-digit milliseconds for a per-user
  reference library (tens–hundreds of sources × 1536 dims). Works **everywhere**:
  Atlas free tier (no index needed), Mongo Community self-hosted, and
  `mongodb-memory-server` in tests. This is what makes 7E deployable without the
  Atlas index the team could not create (quota).
- **`AtlasVectorSearchStore` (`AI_RAG_VECTOR_BACKEND=atlas`)** — the `$vectorSearch`
  path below; the scale-out option if a deployment ever expects thousands of chunks
  per user. If the index is missing on an `atlas`-configured deployment, the store
  throws a typed error the route maps to 503 ("vector search not available on this
  datastore — create an Atlas Vector Search index or switch AI_RAG_VECTOR_BACKEND=scan"),
  rather than silently failing.

Non-Mongo implementations (pgvector / Qdrant / Milvus) remain out of scope for 7E (§7)
but the seam keeps the "later" honest.

### 3.3 Atlas Vector Search index (only for `AI_RAG_VECTOR_BACKEND=atlas` — NOT needed for the default `scan` backend)

Name: **`source_chunks_vector`** on collection `source_chunks`:

```json
{
  "fields": [
    { "type": "vector", "path": "vector", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "ownerId" },
    { "type": "filter", "path": "sharedWith" },
    { "type": "filter", "path": "sourceId" }
  ]
}
```

**`sharedWith` is a required filter field** — Atlas Vector Search rejects a `$vectorSearch`
filter on a path that isn't declared in the index. Without it, the D-1 owner-visibility
predicate `{ $or:[{ownerId},{sharedWith}] }` fails at query time and shared-with-me sources
are unreachable (mock-mongoose unit tests pass because they don't touch the real index —
this is a production-only class of bug).

Atlas UI: Cluster → Search → Create Search Index → JSON Editor → database `docflow`,
collection `source_chunks`. ~2 minutes to build. **The plan doc must ship this exact
JSON; the server logs it when it detects the index is missing.** (If a deployment later
uses a different `AI_EMBED_DIMENSIONS`, the index must match — `numDimensions` must equal
the configured `AI_EMBED_DIMENSIONS`, and the embedding request must request that same
length; the three values must agree or vector writes silently fail / queries 503.)

### 3.4 Draft request/response (wire)

Request body (`POST /api/ai/draft`):

```ts
{ prompt: string, context?: { before: string; after: string }, k?: number }  // k default 6, max 12
```

SSE: same protocol as `/complete`, plus the `done` payload carries the citation table:

```
event: done
data: {"usage":{...},"citations":[{"ref":1,"sourceId":"665f…","label":"Ujang (2019)"}]}
```

`label` is a short human-readable tag (first author family + year) used in the sidebar UI.

### 3.5 Client: `aiDraft` transport (`apps/web/src/ai/aiDraft.ts`, new)

Sibling of `aiStream`: same SSE parsing, but yields `{ type: 'delta' | 'done', text?, citations? }`
so the caller keeps the citation table. Type lives in `packages/core/src/ai/types.ts`:

```ts
interface AIDraftCitation { ref: number; sourceId: string; label: string }
type AIDraftEvent = { type: 'delta'; text: string } | { type: 'done'; citations: AIDraftCitation[] }
type AIDraftFn = (req: { prompt: string; context?: {...} }, signal: AbortSignal) => AsyncIterable<AIDraftEvent>
```

Injected exactly like `aiStream` (prop → DocsEditor → sidebar prop). Demo stays uninjected.

---

## 4. Task Breakdown

### 7E-1. Embeddings provider (server) ⇐ none
- Files: `apps/server/src/ai/rag/embeddings.ts` (new), `apps/server/src/ai/rag/types.ts` (new),
  `config.ts` (`ai.embeddings` block — **modify** the existing 7A-2 stub, which has a
  non-viable `AI_EMBED_PROVIDER ?? 'claude'` default; replace with the OpenAI-compatible
  default and the wider fields below), `apps/server/.env.example`, `docker/server.env.example`.
- Accept: unit test — mocked fetch returning two embedding vectors normalizes to
  `number[][]` with declared dimensions; empty-key local endpoint omits `Authorization`;
  **`dimensions` is sent in the request body iff `AI_EMBED_DIMENSIONS` is set** (asserted
  for OpenAI-shaped configs; absent for Ollama-shaped configs); boot warns when
  `AI_EMBED_DIMENSIONS` ≠ the server-side `VECTOR_INDEX_NUM_DIMENSIONS` config (§3.1).

### 7E-2. Source indexing + vector store (server) ⇐ 7E-1
- Files: `apps/server/src/ai/rag/sourceIndexer.ts` (new — build retrieval text, embed, upsert/delete),
  `apps/server/src/ai/rag/vectorSearch.ts` (new — `AtlasVectorSearchStore` impl of the §3.2.bis
  `VectorStore` seam: `$vectorSearch` + Source hydration), `apps/server/src/routes/sources.ts`
  (hook create/update/import/delete **and share/unshare** — fire-and-forget), model:
  `apps/server/src/models/SourceChunk.ts` (new, mirrors existing model style).
- **Indexer correctness details:** on `Source` write, `deleteBySource(id)` BEFORE the new
  upsert so a failed re-embed leaves NO stale chunk (the old behavior — keep stale text on
  update-fail — is a §6 risk we fix here). `sharedWith` is mirrored metadata-only on
  share/unshare (no re-embed). Import of N sources queues sequential embed batches (concurrency
  cap ≤4) so 100 parallel `embed` requests don't stampede the endpoint.
  **Route gap:** `apps/server/src/routes/sources.ts` has `POST /:id/share` but **no unshare
  endpoint** — 7E-2 adds a `DELETE /:id/share` (or `DELETE /:id/share/:userId`) that mirrors
  `sharedWith` updates on the chunks. Without it, an unshared source stays vector-reachable
  by the ex-collaborator (the §6 cross-owner row is violated). List this route addition
  explicitly in the task brief; it is small but non-optional.
- Accept: unit tests with mocked mongoose — (a) retrieval-text builder (authors/year/abstract
  formatting, **truncated to ~1800 chars**); (b) indexer upserts on create, **deletes-then-upserts**
  on update (assert stale chunk gone before new write), deletes on remove; (c) `sharedWith`
  mirrored on share without re-embed; (d) **vector query applies the
  `{ $or:[{ownerId:userId},{sharedWith:userId}] }` filter and re-checks the same predicate
  against `Source.owner`/`Source.sharedWith` at hydration** (assert a source shared-with the
  user is retrievable; assert owner-only filter is NOT used); (e) `VectorStore` is the seam —
  the route depends on the interface, not on `AtlasVectorSearchStore` concretely.

### 7E-3. `POST /api/ai/draft` (server) ⇐ 7E-2
- File: `apps/server/src/routes/ai.ts` (add route), `apps/server/src/ai/rag/draftPrompt.ts` (new).
- Flow per §2; `k` clamped to ≤12; when retrieval returns 0 sources → stream a polite
  "no matching sources in your reference library" answer with an empty citation table
  (never invent citations).
- System prompt rules: ground every borrowed claim on the snippets; cite as `[n]` right
  after the claim; use ONLY the provided numbers; if the snippets don't support the
  request, say so instead of fabricating.
- Accept: unit tests — prompt assembly (numbered snippets, **owner-visibility predicate
  `{ $or:[{ownerId},{sharedWith}] }` asserted**, **total snippet bytes bounded** by the
  per-snippet cap × k), done-event citation table shape, 0-results path, 503 when embeddings
  unconfigured, 503 (with setup message) when the `VectorStore` declares the backend
  unsupported for this datastore.

### 7E-4. Sidebar: "Draft with citations" + citation-node insert (library + app) ⇐ 7E-3, 7D
- Files: `packages/core/src/ai/types.ts` (types §3.5), `apps/web/src/ai/aiDraft.ts` (new),
  `packages/plugins/src/citation.ts` (new exported pure helper `buildCitationNodes(engine, {sourceId, locator})`
  — returns `{type:'citation'|'footnote', attrs}` per `engine.isNoteStyle()`, used by both
  the existing `insertCitation` path AND the new content-array path below — do NOT duplicate
  the note-vs-inline branching in the sidebar), `packages/vue/src/components/sidebars/AISidebar.vue`
  (new `aiDraft` prop; macro/quick action or mode toggle; renders citation chips with
  `label` under the draft turn; **unified** `handleInsert` — plain text when no citations
  table, content-array when citations present — replacing the current plain-text-only
  `state.tr.insertText` insert; Insert is gated on the `done` event arriving), `apps/web/src/components/EditorView.vue`
  (inject `aiDraft` exactly like `aiStream`).
- **Insert = ONE `view.dispatch`:** build a content array `[textSpan, citationNode, textSpan, …]`
  by splitting the streamed text on the marker grammar (below) and interleaving
  `buildCitationNodes(...)` outputs; dispatch with `view.dispatch(state.tr.insertContent(array, from, to))`.
  Do NOT call the `insertCitation` plugin command per marker — that dispatches N transactions.
  The `CitationEngineExtension.onUpdate` walk fires on this single dispatch, runs
  `engine.onSourcesChange` → the host's `scheduleSnapshotPersist` writes the cited sources'
  CSL to `Document.sources` → peers render via the Phase 6 snapshot (no new rendering path).
- **Marker grammar (pinned, no ambiguity):** the parser runs over the **streamed draft
  text** (plain text — the §4 draft system prompt carries the existing `Return ONLY the
  resulting text — no markdown fences` rule, so the stream contains no ``` fences and no
  citation nodes by construction; citation nodes are BUILT from markers, so "marker inside
  a citation node" is not a reachable state). Match `/\[(\d{1,3})\]/g`; the captured `n`
  must be a key in the `done`-event citation table. An unresolved `n` (not in the table)
  is **stripped from the text entirely** (deleted, not left as a literal `[9]`, never mapped
  to a wrong source). Adjacent runs `[1][2]` each produce their own citation node (no range
  expansion — `[1-3]` is left literal since `1-3` isn't a valid `\d{1,3}` capture; `[[1]]`
  matches the inner `[1]`). Markdown footnotes (`[^1]`) are left literal (the `^` breaks
  the capture). One assertion covers each of: basic `[1]`; adjacent `[1][2]` → two nodes;
  unresolved `[9]` stripped; `[[1]]` → one node (inner match); `[^1]` left literal.
- **`aiDraft.ts` SSE parsing:** shares framing/`delta` handling with `aiStream`; DIVERGES
  on the `done` event (captures `citations` and yields `{type:'done', citations}` — `aiStream`
  discards `done` data). Factor the shared framing into a small `parseSse` util if it
  reads cleanly; otherwise copy (mark with a comment pointing to `aiStream.ts`).
- Accept: unit tests —
  - **marker→node mapping** ([1] basic; adjacent [1][2] → two nodes; unresolved [9] stripped;
    `[[1]]` → one inner node; `[^1]` left literal) per the grammar above;
  - **single-transaction insert**: spy on `view.dispatch`; assert it is called **exactly once**
    for a draft with 3 markers (not 3×), and `tr.docChanged` step count is the single `insertContent`;
  - **citation nodes carry real `sourceId`s** from the done-event table;
  - **snapshot persist still fires**: `CitationEngineExtension.onUpdate` (or its `onSourcesChange`
    callback) is invoked once after the single dispatch — assert the cited-source CSL flows
    into the snapshot (Phase 6 mechanism intact, not bypassed);
  - `handleInsert` with no `citations` table falls back to the current plain-text insert
    (no regression for non-draft turns);
  - `pnpm -r typecheck` + `pnpm -r test:unit` green.
- **Collab gate (matches 7B-3):** in a two-client websocket room, A drafts + inserts 3
  citations → B receives the citation NODES via Yjs (one transaction); B's engine walks
  the doc, surfaces the sourceIds; once the snapshot PUT propagates, B renders the
  citations identically to A. Document the realtime-caveat below as a known limitation,
  not a test failure.

### 7E-5. Ops docs ⇐ 7E-2
- `docker/server.env.example` + `apps/server/.env.example`: `AI_EMBED_*` vars with both
  hosted-OpenAI and local-Ollama examples; a short "Atlas Vector Search index" section
  with the §3.3 JSON (also linked from CLAUDE.md note in 7F).
- Accept: a fresh deployment can go from zero to working RAG using only these docs.

---

## 5. Sequencing & user touchpoints

```
7E-1 ─► 7E-2 ─► (USER: create Atlas index §3.3) ─► 7E-3 ─► 7E-4 ─► 7E-5
                     ▲ can run in parallel with 7E-3 coding
```

- After 7E-2 merges, the user creates the Atlas index (5 min, JSON provided).
- Local test path (5174): index 2–3 real sources, then sidebar → "Draft with citations"
  → draft streams with `[n]` markers → Insert → citation chips render per active CSL
  style → export PDF/DOCX still resolves those citations (Phase 6 path, unchanged).

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Model fabricates citations** (hallucinated source ids, markers without basis) | Markers-not-ids (§2.1); citation table server-owned; unresolved markers stripped client-side; system prompt forbids inventing numbers; 0-results path never cites. |
| **Cross-owner leakage via vector search** | The owner-visibility predicate `{ $or:[{ownerId},{sharedWith}] }` is a `$vectorSearch` filter (with `sharedWith` declared in the §3.3 index) **AND** is re-checked against `Source.owner`/`Source.sharedWith` at hydration (§2.2). Unit test asserts both clauses. |
| **Index missing/mismatched dimensions on a deployment** | Detect Atlas `$vectorSearch` errors → log the §3.3 JSON once + 503 with setup message; other AI features unaffected (§2.3). |
| **Embedding cost on large libraries** | Sources are small & few (per-user reference library); embed only on write, not on query-path except the query vector itself; `AI_EMBED_MODEL` configurable to a local model for privacy-strict installs. |
| **Stale embeddings after source edit** | Re-embed on every source update/import (fire-and-forget); `updatedAt` on chunks aids debugging; delete on source remove. |
| **Draft quality with thin metadata** (sources without abstracts) | Retrieval document includes title/authors/year/container even without abstract; prompt instructs the model to say when snippets are insufficient instead of fabricating. |
| **Dangling `sourceId` rendering in realtime collab** (peer B receives a citation node whose source A found via RAG; B's live library / doc snapshot doesn't yet have it) | Inherited from Phase 6 — the citation snapshot (`Document.sources`) is REST-persisted via `scheduleSnapshotPersist`, not Yjs-synced, so B may render `?` briefly until the PUT propagates. **7E must not worsen this:** the single-`view.dispatch` insert (§2.6) keeps firing `CitationEngineExtension.onUpdate` → `onSourcesChange` exactly like a manual insert. Document as a known collab limitation; do NOT build a Yjs-side CSL mirror in 7E (out of scope). |
| **Stale embedding on update** (the old "fire-and-forget leaves the chunk searchable by nothing" framing was wrong) | 7E-2 `deleteBySource(id)` BEFORE the new upsert — a failed re-embed leaves NO chunk (not a stale one). `updatedAt` aids debugging. Concurrent create+delete race is acceptable (next edit reconciles). |
| **Vector dimension mismatch** (deploy sets `AI_EMBED_DIMENSIONS=768` for Ollama while the index `numDimensions=1536`, or vice versa) | Boot warns when `AI_EMBED_DIMENSIONS` ≠ the server-side `VECTOR_INDEX_NUM_DIMENSIONS` config (§3.1, which mirrors the §3.3 index JSON); the embedding request sends `dimensions` only where the backend supports shortening (§3.1); a mismatched write surfaces as a typed store error → 503 with setup guidance, never silent corruption. Note the boot can only compare the two server-side values — the live Atlas index is a manual step and is checked only via its error on first write/query. |
| **7E silently disabled on self-hosted Mongo Community** (no `$vectorSearch` capability) | The §3.2.bis `VectorStore` seam throws a typed "unsupported on this datastore" error the route maps to 503 with a setup message; other AI features (7A–7D) keep working. Non-Atlas backends are explicitly out of scope (§7) but the seam makes "later" honest. |

---

## 7. Out of Scope (7E)

- **Document-chunk indexing** (full-doc RAG) — bounded context already covers drafting
  context; revisit if users ask for "chat with my whole document".
- **Multi-chunk splitting of long sources** — schema-ready (`chunkIndex`), deferred.
- **Queue/worker-based reindexing, backfill CLI** — backfill is one re-save per source;
  a script can be added later if libraries grow large.
- **pgvector / Qdrant / Milvus backends** — the §3.2.bis `VectorStore` seam ships now,
  but only `AtlasVectorSearchStore` is implemented. Non-Atlas backends land later if a
  non-Atlas self-hosted customer appears (phase-7 plan §6 note). On Mongo Community,
  7E is hard-disabled with a clear 503 — out of scope for 7E, not silently broken.
- **Per-user token quotas** — unchanged from phase-7 scope.
