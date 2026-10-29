import type { Editor } from '@tiptap/core'
import {
  SUGGESTION_DELETE,
  SUGGESTION_FORMAT,
  SUGGESTION_INSERT,
  type SuggestionSummary,
} from './suggestTypes.js'

/** All pending suggestions, ordered by position. */
export function getSuggestions(editor: Editor): SuggestionSummary[] {
  const byId = new Map<string, SuggestionSummary>()
  const scan = (markName: string, type: SuggestionSummary['type']) => {
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      for (const mark of node.marks) {
        if (mark.type.name !== markName) continue
        const id = mark.attrs.suggestionId as string
        const existing = byId.get(id)
        if (existing) {
          existing.from = Math.min(existing.from, pos)
          existing.to = Math.max(existing.to, pos + node.nodeSize)
        } else {
          byId.set(id, {
            id,
            type,
            authorId: (mark.attrs.authorId as string | null) ?? null,
            authorName: (mark.attrs.authorName as string | null) ?? null,
            from: pos,
            to: pos + node.nodeSize,
            ...(type === 'format'
              ? {
                  format: (mark.attrs.format as string | null) ?? undefined,
                  delta: (mark.attrs.delta as 'add' | 'remove' | null) ?? undefined,
                }
              : {}),
          })
        }
      }
    })
  }
  scan(SUGGESTION_INSERT, 'insert')
  scan(SUGGESTION_DELETE, 'delete')
  scan(SUGGESTION_FORMAT, 'format')
  return [...byId.values()].sort((a, b) => a.from - b.from)
}
