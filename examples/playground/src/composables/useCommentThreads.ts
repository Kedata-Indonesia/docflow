import { ref, type Ref } from 'vue'
import type { CommentItem } from '@kedata-indonesia/docflow-vue'
import { SAMPLE_COMMENTS } from '../fixtures/collaboration'
import type { LogFn } from '../types'

export interface CommentThreadsOptions {
  userName: Ref<string>
  log: LogFn
}

/** Host-owned comment threads: create, reply, resolve and delete. */
export function useCommentThreads({ userName, log }: CommentThreadsOptions) {
  const comments = ref<CommentItem[]>(SAMPLE_COMMENTS)

  /** Monotonic ids — `Date.now()` collides on rapid clicks. */
  let commentSeq = 0
  function nextId(prefix: string): string {
    commentSeq += 1
    return `${prefix}-${commentSeq}`
  }

  function addComment(text: string, anchorText?: string, anchorIndex?: number): void {
    comments.value = [
      {
        id: nextId('thread'),
        authorId: 'user-1',
        authorName: userName.value,
        authorColor: '#059669',
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
    const replyId = nextId('reply')
    comments.value = comments.value.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            replies: [
              ...thread.replies,
              {
                id: replyId,
                authorId: 'user-1',
                authorName: userName.value,
                authorColor: '#059669',
                content: text,
                createdAt: Date.now(),
              },
            ],
          }
        : thread,
    )
    log('add-reply', threadId)
  }

  function resolveComment(threadId: string): void {
    comments.value = comments.value.map((thread) =>
      thread.id === threadId
        ? { ...thread, resolved: true, resolvedBy: userName.value }
        : thread,
    )
    log('resolve-comment', threadId)
  }

  function deleteComment(threadId: string): void {
    comments.value = comments.value.filter((thread) => thread.id !== threadId)
    log('delete-comment', threadId)
  }

  function addSampleComment(title: string): void {
    addComment('Sample note from the playground panel.', title)
  }

  return { comments, addComment, addReply, resolveComment, deleteComment, addSampleComment }
}
