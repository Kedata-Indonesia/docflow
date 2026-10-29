import { PluginKey } from '@tiptap/pm/state'
import type { DocumentMode } from '@kedata-indonesia/docflow-core'

/** Mark names — suggestions are marks, so they ride the Yjs doc for free. */
export const SUGGESTION_INSERT = 'suggestionInsert'
export const SUGGESTION_DELETE = 'suggestionDelete'
export const SUGGESTION_FORMAT = 'suggestionFormat'

/** Inline marks whose changes are captured as format suggestions (P3). */
export const FORMAT_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'highlight'])

/** Meta flag marking our own appended transactions so appendTransaction ignores them. */
export const SUGGEST_APPLIED_META = 'suggestChanges:applied'

export interface SuggestionAuthor {
  id?: string | null
  name?: string | null
}

export interface SuggestionSummary {
  id: string
  type: 'insert' | 'delete' | 'format'
  authorId: string | null
  authorName: string | null
  /** ProseMirror positions (from/to) of the suggestion range. */
  from: number
  to: number
  /** For `type: 'format'` — the mark that would be added/removed. */
  format?: string
  /** For `type: 'format'` — `add` applies the mark, `remove` clears it. */
  delta?: 'add' | 'remove'
}

export interface SuggestState {
  mode: DocumentMode
  author: SuggestionAuthor
}

export const suggestChangesKey = new PluginKey<SuggestState>('suggestChanges')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestChanges: {
      /** Switch the document mode (editing / suggesting / viewing). */
      setDocumentMode: (mode: DocumentMode) => ReturnType
      /** Set the author recorded on new suggestions. */
      setSuggestionAuthor: (author: SuggestionAuthor) => ReturnType
      /** Accept one suggestion (keep insertions, drop deletions). */
      acceptSuggestion: (id: string) => ReturnType
      /** Reject one suggestion (drop insertions, keep deletions). */
      rejectSuggestion: (id: string) => ReturnType
      /** Accept every pending suggestion. */
      acceptAllSuggestions: () => ReturnType
      /** Reject every pending suggestion. */
      rejectAllSuggestions: () => ReturnType
    }
  }
}
