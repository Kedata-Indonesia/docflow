# Orphaned Comment Threads (Issue #133)

## 1. Goal

When the text a comment thread is anchored to is deleted from the document,
the thread must not silently stay "active" in the Discussion Panel. It is
**marked as orphaned** (non-destructive): it remains visible with a
"text deleted" indicator, and the user can manually **Resolve** or **Delete**
it. Deleting uses the already-existing (but currently unreachable)
`DELETE /api/documents/:id/comments/:threadId` endpoint.

No server changes. No schema migration. Orphan state is computed client-side.

## 2. Problem

Repro (from the issue): type `test 1`, `test 2`, `test 3`; select `test 2`
and add a comment; delete `test 2`. The thread stays active in the Discussion
Panel with its stale quote and no indication the anchor is gone.

### Root cause

The doc-side anchor is a TipTap **mark** (`comment`, attrs `{ threadId, pos }`,
`packages/plugins/src/comment.ts`) that lives inside the Yjs-synced
ProseMirror document. The thread record lives in MongoDB
(`apps/server/src/models/CommentThread.ts`). When the anchored text is
deleted, the mark disappears with it — but **nothing ever reconciles marks
against threads**: no scan, no tombstone, no orphan flag. The schema header
note even says "the UI recomputes the resolved position from the mark at
render time" — that recomputation does not exist anywhere.

## 3. Key facts (verified, with file references)

- **Server schema** — `apps/server/src/models/CommentThread.ts`:
  `threadId` (UUID, matches the mark's `data-comment-thread` attr), `docId`,
  `anchorText`, `anchorPos` (volatile, creation-time only), author fields,
  `content`, `resolved` / `resolvedBy` / `resolvedByName` / `resolvedAt`,
  `replies[]`. Compound index `{ docId, resolved, createdAt }`.
- **Library type** — `CommentItem` in `packages/vue/src/types.ts:9-45`
  (`anchorText?`, `anchorIndex?`, `resolved?`, `replies`, …). Host adapter
  `adaptThread()` in `apps/web/src/components/EditorView.vue:36-92`
  (`threadId→id`, `anchorPos→anchorIndex`).
- **Anchor capture** — `captureSelection()` (`EditorView.vue:296-312`) stores
  `selectedTextSnippet` / `selectedTextIndex`; `handleAddComment()`
  (`EditorView.vue:810-846`) POSTs the thread then sets the mark via
  `setMark('comment', { threadId, pos })`. `unsetMark('comment'` appears
  **zero times** in the codebase.
- **Sidebar** — `packages/vue/src/components/sidebars/CommentsSidebar.vue` is
  presentational: props `comments`, `selectedTextSnippet`,
  `selectedTextIndex`; emits `add-comment` / `add-reply` / `resolve-comment`.
  No click-to-locate, no delete.
- **DocsEditor is a pass-through** — props `DocsEditor.vue:65-71`, emits
  `:139-141`, sidebar mount `:2073-2082`.
- **REST** — `apps/server/src/routes/comments.ts`: `GET/POST /:id/comments`,
  `POST …/:threadId/replies`, `PATCH …/:threadId/resolve`,
  `DELETE …/:threadId` (author/editor/owner only). Every mutation broadcasts
  `comment:created|replied|resolved|deleted` on the collab WS room. The web
  client already handles `comment:deleted` (`EditorView.vue:1011-1014`), but
  **no client code calls DELETE today**.
- **Collaboration** — threads are REST-persisted only; Yjs carries just the
  mark (which therefore replicates to all peers with normal collab sync).
- **Tests** — server: `apps/server/src/__tests__/comments.spec.ts` (role
  gating, broadcasts, delete authz). No vue-side comment tests yet.

## 4. Design decisions (agreed with product)

1. **Mark as orphaned — never auto-delete, never auto-resolve.**
   Non-destructive under collaboration: transient mark loss (Yjs merge
   windows, snapshot restore) must not destroy or refile user data. Matches
   Google Docs-style retention. The `anchorText` quote stays as the
   human-readable remnant.
2. **Orphan state is computed client-side, not persisted.** All peers derive
   the same state because marks replicate with the doc. (Rejected
   alternative: a persisted `orphanedAt` flag — needs a migration and can
   diverge from actual doc state.)
3. **Delete action for orphaned threads only**, wired to the existing DELETE
   endpoint (authz + broadcast already server-side).

Definition: a thread is **orphaned** when it is anchored
(`anchorIndex != null`) and its `id` no longer appears on any `comment` mark
in the current document.

## 5. Implementation steps

### 5.1 Orphan detection — `packages/vue/src/components/DocsEditor.vue`

- Add a `presentCommentThreadIds` ref (`Set<string>`) and
  `refreshCommentAnchors()`: walk `editor.value.state.doc.descendants(...)`,
  collecting `mark.attrs.threadId` for every mark whose `type.name ===
  'comment'`.
- Debounce the scan (~200 ms). Trigger it from the editor `transaction`
  listener (registration site already exists in the `isReady` watcher) and
  once after ready.
- **Transient-empty-doc guard:** when `props.collaboration` is present, defer
  the first scan until the provider has synced (or the doc is non-empty);
  otherwise threads briefly flash orphaned while the Yjs doc is still loading.
- Computed `orphanedCommentIds`: ids from the `comments` prop that are
  anchored (`anchorIndex != null`) and absent from `presentCommentThreadIds`.
  Do not filter by `resolved` — orphans show in both sidebar filters.
- Pass `:orphaned-ids="orphanedCommentIds"` to `CommentsSidebar` and re-emit
  a new `delete-comment` event (add it to `defineEmits`).

### 5.2 Sidebar UI — `packages/vue/src/components/sidebars/CommentsSidebar.vue`

- New prop `orphanedIds?: string[]`; new emit
  `delete-comment: [commentId: string]`.
- Orphaned thread card: amber "text deleted" badge; the quote block is
  muted/struck through. Actions: **Resolve** (existing button) plus **Delete**
  (`Trash2` from `lucide-vue-next`, already a dependency). Delete shows only
  for orphaned threads. Reply stays enabled.
- New locale keys in `packages/vue/src/locales/en.ts` (block at
  `en.ts:336-353`) and mirrored in `id.ts`, e.g.
  `sidebars.comments.orphaned` ("Text deleted" / "Teks dihapus"),
  `sidebars.comments.delete`, and a confirm-delete label.

### 5.3 Host wiring — `apps/web/src/components/EditorView.vue`

- Add `deleteComment(threadId)` next to `resolveComment()` (`:797-804`):
  `DELETE /api/documents/:docId/comments/:threadId` with
  `credentials: 'include'`.
- Add `handleDeleteComment(threadId)`: await the call, then optimistically
  remove the thread from `comments.value` (peers are updated via the existing
  `comment:deleted` WS branch at `:1011`).
- Wire `@delete-comment="handleDeleteComment"` on `<DocsEditor>` (next to
  `@resolve-comment` at `:1423`).

### 5.4 Server

No changes — endpoint, authz (author/editor/owner), and the
`comment:deleted` broadcast already exist.

### 5.5 Tests

- `packages/vue/src/__tests__/DocsEditor.test.ts`:
  - thread whose anchored text is deleted becomes orphaned;
  - thread whose mark survives is not orphaned;
  - a general comment (no anchor) is never orphaned;
  - the first scan is deferred until content is present (no orphan flash).
- New `packages/vue/src/__tests__/CommentsSidebar.test.ts`:
  - badge renders for ids in `orphanedIds`;
  - Delete emits `delete-comment`;
  - Delete button is absent for non-orphaned threads.
- Run the full vue unit suite + typecheck; server suite stays untouched and
  green.

### 5.6 Docs

`docs/LIBRARY_CONTRACT.md` currently has no comment section, so no contract
update is strictly required; if you document the emits surface, add a short
"Comment lifecycle" note there describing `delete-comment` and the orphan
convention.

## 6. Edge cases

- **Version/snapshot restore** (`handleRestoreSnapshot`,
  `EditorView.vue:913-933`) wholesale replaces content and wipes marks →
  affected threads show as orphaned. Intended: the user resolves or deletes
  them explicitly.
- **Partial deletion:** the mark is `inclusive: true`, so deleting part of
  the anchored text does not orphan the thread; only removing all marked text
  does.
- **Resolve does not remove the mark** (pre-existing gap, out of scope).
  Candidate follow-up: `unsetMark('comment')` on resolve/delete.
- Never blank `anchorText` on orphaned threads — it is the only remnant of
  the anchor.

## 7. Verification

1. Issue repro: comment on `test 2`, delete the text → thread shows the
   "text deleted" badge in the Active filter; quote remains, muted.
2. Resolve on an orphaned thread → moves to the Resolved filter.
3. Delete on an orphaned thread → disappears locally and for all collab
   peers (WS `comment:deleted`).
4. Reload before any action → orphan state identical (computed, not
   persisted).
5. `pnpm --filter @kedata-indonesia/docflow-vue typecheck` and
   `pnpm --filter @kedata-indonesia/docflow-vue test:unit` green; server
   suite green.
