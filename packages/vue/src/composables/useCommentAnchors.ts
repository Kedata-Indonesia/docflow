import { computed, onUnmounted, ref, type Ref } from 'vue'
import type { DocsEditor, EditorOptions } from '@kedata-indonesia/docflow-core'
import type { CommentItem } from '../types.js'

export interface UseCommentAnchorsOptions {
  editor: Ref<DocsEditor['editor'] | null>
  isReady: Ref<boolean>
  /** Collaboration config is read lazily (props can change after mount). */
  getCollaboration: () => EditorOptions['collaboration']
  /** Comment list is read lazily so the orphan computed stays reactive. */
  getComments: () => CommentItem[]
}

/**
 * Issue #133 — orphaned comment thread detection.
 *
 * The doc-side anchor is a TipTap `comment` mark (threadId, pos) living inside
 * the ProseMirror document. When the anchored text is deleted the mark vanishes
 * with it — but the thread record lives in MongoDB and nothing reconciled the
 * two. We compute "orphaned" client-side: a thread is orphaned when it is
 * anchored (anchorIndex != null) and its id no longer appears on any `comment`
 * mark in the current document. Never persisted — all peers derive the same
 * state because marks replicate.
 */
export function useCommentAnchors(options: UseCommentAnchorsOptions) {
  const { editor, isReady, getCollaboration, getComments } = options

  const presentCommentThreadIds = ref<Set<string>>(new Set())
  let commentAnchorScanTimer: ReturnType<typeof setTimeout> | null = null
  // Guards the first scan in collab mode — until the Yjs doc has synced
  // (doc is non-empty) we skip, otherwise every anchored thread would
  // briefly flash orphaned while the room is still loading. Reactive so
  // the `orphanedCommentIds` computed stays empty until the first real
  // scan has run.
  const firstCommentScanDone = ref(false)

  function refreshCommentAnchors() {
    if (!editor.value || !isReady.value) return
    // Transient-empty-doc guard for collaboration: the first scan must
    // wait until the provider has synced real content, otherwise all
    // anchored threads flash orphaned during the Yjs load window. In
    // non-collab mode the guard is a no-op (content is seeded eagerly).
    const doc = editor.value.state.doc
    if (getCollaboration() && !firstCommentScanDone.value) {
      // An empty ProseMirror doc is just its root paragraph node — size 2
      // (open + close tokens). Anything above means real content loaded.
      if (doc.content.size <= 2) return
    }
    firstCommentScanDone.value = true
    const ids = new Set<string>()
    doc.descendants((node) => {
      for (const mark of node.marks) {
        if (mark.type.name === 'comment' && mark.attrs.threadId) {
          ids.add(mark.attrs.threadId as string)
        }
      }
      return true
    })
    presentCommentThreadIds.value = ids
  }

  function scheduleCommentAnchorScan() {
    if (commentAnchorScanTimer) clearTimeout(commentAnchorScanTimer)
    commentAnchorScanTimer = setTimeout(refreshCommentAnchors, 200)
  }

  const orphanedCommentIds = computed(() => {
    // Until the first scan has run we don't know which marks are present
    // — returning empty avoids orphan false-positives during collab load.
    if (!firstCommentScanDone.value) return []
    const present = presentCommentThreadIds.value
    return getComments()
      .filter((c) => c.anchorIndex != null && !present.has(c.id))
      .map((c) => c.id)
  })

  onUnmounted(() => {
    if (commentAnchorScanTimer) clearTimeout(commentAnchorScanTimer)
  })

  return {
    orphanedCommentIds,
    scheduleCommentAnchorScan,
  }
}
