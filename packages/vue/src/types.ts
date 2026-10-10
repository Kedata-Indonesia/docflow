import type { CslItemData } from '@kedata-indonesia/docflow-core'

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

/**
 * Scoped props of `<DocsEditor>`'s `#references-sidebar` slot (issue #22).
 *
 * A host that fills the slot **replaces** the built-in `ReferencesSidebar`; the
 * library stays backend-agnostic and the host fetches its own sources/results.
 * Leave the slot empty to keep the built-in sidebar.
 *
 * `pickerMode` is `true` while an insert-citation request is pending — call
 * `onInsert(sourceId)` to complete it, or `onClose()` to cancel.
 */
export interface ReferencesSidebarSlotProps {
  /** Live reference library (mutates as the host edits through the actions). */
  sources: CslItemData[]
  /** Active CSL style id. */
  activeStyle: string
  /** True while a citation insert is waiting for a source pick. */
  pickerMode: boolean
  /** True when the host supplied import ports (`onImportDoi` / `onImportBibliography`). */
  canImport: boolean
  /** True while an import is in flight. */
  importing: boolean
  /** Host-provided import result message (success or error). */
  importMessage: string
  /** Complete the pending citation with a chosen source, or insert one directly. */
  onInsert: (sourceId: string) => void
  /** Close the sidebar (cancels any pending pick). */
  onClose: () => void
  /** Add a source to the library. */
  onCreate: (source: CslItemData) => void
  /** Update an existing source. */
  onUpdate: (source: CslItemData) => void
  /** Remove a source by id. */
  onRemove: (id: string) => void
  /** Switch the active CSL style. */
  onStyleChange: (styleId: string) => void
  /** Import a source by DOI (only when `canImport`). */
  onImportDoi: (doi: string) => void
  /** Import a BibTeX/RIS blob (only when `canImport`). */
  onImportBibliography: (payload: { format: 'bibtex' | 'ris'; text: string }) => void
}
