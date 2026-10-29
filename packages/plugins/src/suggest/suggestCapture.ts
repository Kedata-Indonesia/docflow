import { TextSelection } from '@tiptap/pm/state'
import type { Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { adjacentRunId, markAttrs, newSuggestionId } from './suggestRuns.js'
import {
  SUGGESTION_DELETE,
  SUGGESTION_INSERT,
  suggestChangesKey,
} from './suggestTypes.js'

/**
 * P1 capture: genuine user input only (typing, paste, backspace/delete), so
 * programmatic writes (AI streaming, collaboration echoes, host commands) are
 * never mis-tagged. Every handler returns `false` outside suggesting mode so
 * ProseMirror keeps its default behaviour.
 */

/** Typing (and replacing a selection) becomes an insert (+ delete) proposal. */
export function captureTextInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  const current = suggestChangesKey.getState(view.state)
  if (current?.mode !== 'suggesting' || !text) return false
  const insert = view.state.schema.marks[SUGGESTION_INSERT]
  const del = view.state.schema.marks[SUGGESTION_DELETE]
  if (!insert || !del) return false

  const id = adjacentRunId(view.state, from, SUGGESTION_INSERT) ?? newSuggestionId()
  const tr = view.state.tr
  // A replacement keeps the old text, marked as a deletion.
  if (to > from) tr.addMark(from, to, del.create(markAttrs(id, current.author)))
  const insertAt = to
  tr.insertText(text, insertAt, insertAt)
  tr.addMark(insertAt, insertAt + text.length, insert.create(markAttrs(id, current.author)))
  view.dispatch(tr)
  return true
}

/** Backspace/Delete (with or without a selection) becomes a delete proposal. */
export function captureDeleteKey(view: EditorView, event: KeyboardEvent): boolean {
  const current = suggestChangesKey.getState(view.state)
  if (current?.mode !== 'suggesting') return false
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false

  const del = view.state.schema.marks[SUGGESTION_DELETE]
  if (!del) return false
  const { selection, doc } = view.state
  let from: number
  let to: number
  if (!selection.empty) {
    from = selection.from
    to = selection.to
  } else if (event.key === 'Backspace') {
    if (selection.from <= 1) return false
    from = selection.from - 1
    to = selection.from
  } else {
    if (selection.to >= doc.content.size - 1) return false
    from = selection.to
    to = selection.to + 1
  }

  const id = adjacentRunId(view.state, from, SUGGESTION_DELETE) ?? newSuggestionId()
  const tr = view.state.tr.addMark(from, to, del.create(markAttrs(id, current.author)))
  if (event.key === 'Backspace' && selection.empty) {
    tr.setSelection(TextSelection.create(tr.doc, from))
  }
  view.dispatch(tr)
  return true
}

/** Paste becomes an insert proposal over the replaced range. */
export function capturePaste(view: EditorView, slice: Slice): boolean {
  const current = suggestChangesKey.getState(view.state)
  if (current?.mode !== 'suggesting') return false
  const insert = view.state.schema.marks[SUGGESTION_INSERT]
  const del = view.state.schema.marks[SUGGESTION_DELETE]
  if (!insert || !del) return false

  const { from, to } = view.state.selection
  const id = adjacentRunId(view.state, from, SUGGESTION_INSERT) ?? newSuggestionId()
  const tr = view.state.tr
  if (to > from) tr.addMark(from, to, del.create(markAttrs(id, current.author)))
  const insertAt = to
  tr.insert(insertAt, slice.content)
  tr.addMark(insertAt, insertAt + slice.content.size, insert.create(markAttrs(id, current.author)))
  view.dispatch(tr)
  return true
}
