import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { collectRanges } from './suggestRuns.js'
import {
  SUGGESTION_DELETE,
  SUGGESTION_FORMAT,
  SUGGESTION_INSERT,
  SUGGEST_APPLIED_META,
} from './suggestTypes.js'

/** Build the accept/reject transaction over `state` (or null when unchanged). */
export function buildResolveTr(state: EditorState, accept: boolean, id?: string) {
  const { schema } = state
  const insertMark = schema.marks[SUGGESTION_INSERT]
  const deleteMark = schema.marks[SUGGESTION_DELETE]
  const formatMark = schema.marks[SUGGESTION_FORMAT]
  if (!insertMark || !deleteMark) return null

  const insertRanges = collectRanges(state.doc, SUGGESTION_INSERT, id)
  const deleteRanges = collectRanges(state.doc, SUGGESTION_DELETE, id)
  const formatRanges = formatMark ? collectRanges(state.doc, SUGGESTION_FORMAT, id) : []
  if (insertRanges.length === 0 && deleteRanges.length === 0 && formatRanges.length === 0) return null

  const tr = state.tr

  // Format suggestions (P3): accept applies the recorded mark change, reject
  // just clears the proposal. Done first so later deletions don't invalidate
  // these positions.
  for (const range of formatRanges) {
    if (accept) {
      const target = schema.marks[range.attrs.format as string]
      if (target) {
        if (range.attrs.delta === 'remove') tr.removeMark(range.from, range.to, target)
        else tr.addMark(range.from, range.to, target.create())
      }
    }
    if (formatMark) tr.removeMark(range.from, range.to, formatMark)
  }

  // Accept: keep insertions, drop deletions. Reject: the inverse.
  const rangesToUnmark = accept ? insertRanges : deleteRanges
  const markToRemove = accept ? insertMark : deleteMark
  const rangesToDelete = accept ? deleteRanges : insertRanges

  for (const range of rangesToUnmark) {
    tr.removeMark(range.from, range.to, markToRemove)
  }
  // Delete from the end so earlier positions stay valid.
  for (const range of [...rangesToDelete].sort((a, b) => b.from - a.from)) {
    tr.delete(range.from, range.to)
  }
  // Mark as ours so appendTransaction doesn't re-capture the format change we
  // just applied (accept adds a format mark → would otherwise loop).
  tr.setMeta(SUGGEST_APPLIED_META, true)
  return tr.docChanged ? tr : null
}

/** Apply `accept`/`reject` for one suggestion (or all when `id` is omitted). */
function resolveSuggestions(editor: Editor, accept: boolean, id?: string): boolean {
  const tr = buildResolveTr(editor.state, accept, id)
  if (!tr) return false
  editor.view.dispatch(tr)
  return true
}

export const acceptSuggestion = (editor: Editor, id: string): boolean =>
  resolveSuggestions(editor, true, id)
export const rejectSuggestion = (editor: Editor, id: string): boolean =>
  resolveSuggestions(editor, false, id)
export const acceptAllSuggestions = (editor: Editor): boolean => resolveSuggestions(editor, true)
export const rejectAllSuggestions = (editor: Editor): boolean => resolveSuggestions(editor, false)
