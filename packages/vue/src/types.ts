export interface Collaborator {
  userId: string
  name: string
  color: string
  avatar?: string
  isTyping?: boolean
}

export interface CommentReply {
  /** Unique id (server-issued UUID). */
  id: string
  authorId: string
  authorName: string
  authorColor: string
  content: string
  /** Epoch ms. */
  createdAt: number
}

/**
 * Phase 9 P9-4 — comment-thread shape. Mirrors the server's
 * `CommentThread` model (the host maps \`threadId\` → \`id\` so the
 * library stays storage-agnostic). The \`anchorIndex\` is the
 * document position at creation time — v1 uses an absolute
 * position; v2 will replace it with a Yjs RelativePosition.
 */
export interface CommentItem {
  /** Server-issued UUID; matches the `data-comment-thread` mark attr. */
  id: string
  authorId: string
  authorName: string
  authorColor: string
  content: string
  anchorText?: string
  /** Document position at creation time. */
  anchorIndex?: number
  /** Epoch ms. */
  createdAt: number
  resolved?: boolean
  resolvedBy?: string | null
  /** Display name for the resolver. Older records may be `null`. */
  resolvedByName?: string | null
  resolvedAt?: number | null
  replies: CommentReply[]
}

export interface DocumentSnapshot {
  /** Server-issued version id (matches `/versions/:versionId/content`). */
  versionId: string
  versionIndex: number
  title: string
  /** Short plain-text preview of the version content (no full state). */
  contentPreview: string
  modifiedBy: string
  timestamp: number
}

export type SidebarKey = 'comments' | 'history' | 'ai' | 'toc' | 'references'
export type ConnectionState = 'connected' | 'connecting' | 'disconnected'
export type SavingStatus = 'saved' | 'saving' | 'offline'

export interface DocumentMeta {
  id: string
  title: string
  owner: { userId: string; name: string; email: string }
  createdAt: number
  updatedAt: number
  wordCount: number
  charCount: number
  pageCount: number
  folderName?: string
}
