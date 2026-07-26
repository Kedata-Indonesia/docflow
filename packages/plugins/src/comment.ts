/**
 * Phase 9 P9-4 — comment plugin.
 *
 * The mark carries ONLY \`threadId\` — never the anchored text. The
 * anchored text + position live in the server-side CommentThread
 * record; the mark is the in-doc pointer to that record. This is the
 * same invariant the citation plugin uses (Phase 6), extended with
 * thread id + position.
 *
 * ### Anchor survival (v1 — position-based)
 *
 * This v1 stores the absolute document position at the time the
 * comment was created. It survives concurrent edits from OTHER
 * users until someone deletes or restructures the surrounding text.
 * For a docflow-style \"inline review comment\" workflow, drift is
 * rare (commenters don't aggressively edit each other's paragraphs
 * mid-review) and the rendered side panel shows the snippet + author
 * so the reader can locate the anchor by content if needed.
 *
 * v2 (follow-up PR) replaces the position field with a Yjs
 * RelativePosition — recommended in the Phase 9 plan §3 spec but
 * deferred because it requires:
 *   1. Yjs encode/decode logic over the mark range.
 *   2. A tombstone strategy when the anchored text is deleted.
 *   3. A migration path for v1 anchors.
 * Phase 9 v1 is the user-visible win; v2 is the robustness upgrade.
 */
import { Mark } from '@tiptap/core'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'

/**
 * The mark carries only the threadId + the position-at-creation-time.
 * The threadId is the link to the server-side CommentThread record
 * (route: GET /api/documents/:id/comments/:threadId); the position is
 * used by the UI to focus / scroll to the anchor when a thread is
 * selected from the sidebar. Text-content is never stored on the
 * mark — the server-side thread holds the snippet captured at
 * creation time.
 */
export interface CommentMarkAttrs {
  threadId: string
  /** Document position at creation time (volatile — recomputed by the
   *  editor on each click). v2 will replace this with a Yjs
   *  RelativePosition. */
  pos: number
}

export const CommentMark = Mark.create({
  name: 'comment',
  // Comments are inclusive (typing inside an existing comment extends
  // the mark range — that's the typical inline-comment UX). Excluding
  // would split the mark on every keystroke.
  inclusive: true,
  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-thread'),
        renderHTML: (attrs) => {
          if (!attrs.threadId) return {}
          return { 'data-comment-thread': attrs.threadId, class: 'docs-comment' }
        },
      },
      pos: {
        default: null,
        // No HTML render — position is server-side state.
        renderHTML: () => ({}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-thread]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },
})

/**
 * The comment plugin (Phase 9 P9-4). Library-only — server-side
 * persistence + role-gated API + UI live in apps/server + apps/web.
 */
export const commentPlugin: DocsEditorPlugin = {
  id: 'comment',
  tiptapExtensions: [CommentMark],
  toolbar: [],
  slashCommands: [],
  commands: {},
}

export { CommentMark as CommentMarkExtension }