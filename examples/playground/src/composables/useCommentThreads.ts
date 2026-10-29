import { ref } from 'vue'
import type { CommentItem } from '@kedata-indonesia/docflow-vue'
import { SAMPLE_COMMENTS } from '../sampleData'

type Options = {
  getUserName: () => string
  /** Title of the open document — anchor text for the sample comment. */
  getDocumentTitle: () => string
  log: (name: string, detail?: string | number) => void
}

/** Comment threads the host owns; the editor only renders and emits intents. */
export function useCommentThreads({
  getUserName,
  getDocumentTitle,
  log,
}: Options) {
  const comments = ref<CommentItem[]>(SAMPLE_COMMENTS)
  /** Monotonic fixture ids — `Date.now()` collides on rapid clicks. */
  let seq = 0

  function author() {
    return {
      authorId: 'user-1',
      authorName: getUserName(),
      authorColor: '#059669',
    }
  }

  function addComment(text: string, anchorText?: string, anchorIndex?: number): void {
    seq += 1
    comments.value = [
      {
        id: `thread-${seq}`,
        ...author(),
        content: text,
        anchorText,
        anchorIndex,
        createdAt: Date.now(),
        replies: [],
      },
      ...comments.value,
    ]
    log('add-comment', text)
  }

  function addReply(threadId: string, text: string): void {
    seq += 1
    const reply = {
      id: `reply-${seq}`,
      ...author(),
      content: text,
      createdAt: Date.now(),
    }

    comments.value = comments.value.map((thread) =>
      thread.id === threadId
        ? { ...thread, replies: [...thread.replies, reply] }
        : thread,
    )
    log('add-reply', threadId)
  }

  function resolveComment(threadId: string): void {
    comments.value = comments.value.map((thread) =>
      thread.id === threadId
        ? { ...thread, resolved: true, resolvedBy: getUserName() }
        : thread,
    )
    log('resolve-comment', threadId)
  }

  function deleteComment(threadId: string): void {
    comments.value = comments.value.filter((thread) => thread.id !== threadId)
    log('delete-comment', threadId)
  }

  function addSampleComment(): void {
    addComment('Sample note from the playground panel.', getDocumentTitle())
  }

  return {
    comments,
    addComment,
    addReply,
    resolveComment,
    deleteComment,
    addSampleComment,
  }
}
