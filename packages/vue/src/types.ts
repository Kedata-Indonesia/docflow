export interface Collaborator {
  userId: string
  name: string
  color: string
  avatar?: string
  isTyping?: boolean
}

export interface CommentReply {
  id: string
  authorId: string
  authorName: string
  authorColor: string
  content: string
  createdAt: number
}

export interface CommentItem {
  id: string
  authorId: string
  authorName: string
  authorColor: string
  content: string
  anchorText?: string
  anchorIndex?: number
  createdAt: number
  resolved?: boolean
  resolvedBy?: string
  resolvedAt?: number
  replies: CommentReply[]
}

export interface DocumentSnapshot {
  versionIndex: number
  title: string
  content: string
  modifiedBy: string
  timestamp: number
}

export type SidebarKey = 'comments' | 'history' | 'ai' | 'toc'
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
