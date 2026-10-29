import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { SuggestionAuthor } from './suggestTypes.js'

// A fresh id per suggestion "run" (a typed word, a pasted block, a deletion).
let suggestionSeq = 0

export const newSuggestionId = (): string => {
  suggestionSeq += 1
  return `sug-${Date.now().toString(36)}-${suggestionSeq.toString(36)}`
}

/** Id of an adjacent suggestion run (so consecutive edits group into one). */
export const adjacentRunId = (
  editorState: EditorState,
  pos: number,
  markName: string,
): string | null => {
  if (pos <= 0) return null
  const before = editorState.doc.resolve(pos).nodeBefore
  if (!before || !before.isText) return null
  const mark = before.marks.find((m) => m.type.name === markName)
  return (mark?.attrs.suggestionId as string | undefined) ?? null
}

export const markAttrs = (id: string, author: SuggestionAuthor) => ({
  suggestionId: id,
  authorId: author.id ?? null,
  authorName: author.name ?? null,
  createdAt: Date.now(),
})

/** Collect contiguous ranges carrying `markName` (optionally a single id). */
export const collectRanges = (
  doc: PMNode,
  markName: string,
  id?: string,
): Array<{ from: number; to: number; attrs: Record<string, unknown> }> => {
  const out: Array<{ from: number; to: number; attrs: Record<string, unknown> }> = []
  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.length === 0) return
    for (const mark of node.marks) {
      if (mark.type.name !== markName) continue
      if (id && mark.attrs.suggestionId !== id) continue
      out.push({ from: pos, to: pos + node.nodeSize, attrs: mark.attrs as Record<string, unknown> })
    }
  })
  return out
}
