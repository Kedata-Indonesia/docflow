import type { Editor } from '@tiptap/core'
import { Slice, Fragment } from 'prosemirror-model'
import {
  getCitationEngine,
  insertMarkdownBlock,
  scrollEditorToPos,
} from '@kedata-indonesia/docflow-plugins'
import { buildContentArray, stripMarkers } from '../markerGrammar.js'
import type { ChatTurn, Localize } from './types.js'

/**
 * Whether a turn's answer can be inserted. A **draft** that errored may still
 * carry unresolved `[n]` markers (no citation table arrived), so inserting it
 * would leak them — Insert stays disabled there. A **chat** turn that failed
 * after emitting partial text is safe to insert (the user already sees it).
 */
export function canInsert(turn: ChatTurn): boolean {
  if (!turn.text) return false
  return !(turn.error && turn.kind === 'draft')
}

/**
 * UNIFIED insert — ONE substantive `view.dispatch` per turn regardless of branch
 * (never N dispatches for N markers):
 *
 *   1. Plain/markdown path (chat turns, and draft turns whose `done` arrived
 *      with `citations: []`): `insertMarkdownBlock` parses the streamed text as
 *      BLOCK markdown and dispatches one transaction.
 *   2. Citation content-array path (draft with ≥1 citation): build ONE content
 *      array via `buildContentArray` and dispatch ONE `tr.replace(...)` with a
 *      closed slice of inline nodes. ProseMirror `Transaction` has no
 *      `insertContent` helper — that's a TipTap chain command that dispatches
 *      per call.
 *   3. No-engine fallback: strip the markers first, so a draft with `[n]` but no
 *      citation engine inserts clean text (no marker leak).
 *
 * `view.focus()` afterwards may fire a cosmetic zero-step transaction
 * (scroll/focus); it does not expand Yjs history, so the "one history entry"
 * invariant holds.
 */
export function insertTurn(
  editor: Editor | null,
  turn: ChatTurn,
  onInserted: () => void,
  t: Localize,
): void {
  if (!editor) {
    // No editor to insert into — say so instead of failing silently (#147).
    turn.error = true
    turn.errorText = t('sidebars.ai.insertFailed')
    return
  }
  if (!canInsert(turn) || !turn.text) return

  const { state, view } = editor
  const { from, to } = state.selection

  if (!turn.citations || turn.citations.length === 0) {
    insertMarkdownBlock(editor, view, from, to, turn.text)
    focusInsertionEnd(editor)
    onInserted()
    return
  }

  const engine = getCitationEngine(editor)
  if (!engine) {
    insertMarkdownBlock(editor, view, from, to, stripMarkers(turn.text))
    focusInsertionEnd(editor)
    onInserted()
    return
  }

  const tableByRef = new Map(turn.citations.map((citation) => [citation.ref, citation]))
  const array = buildContentArray(turn.text, tableByRef, engine)
  const { schema } = state
  const nodes = array
    .map((part) => (typeof part === 'string' ? schema.text(part) : schema.nodeFromJSON(part)))
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
  view.dispatch(state.tr.replace(from, to, new Slice(Fragment.from(nodes), 0, 0)))
  focusInsertionEnd(editor)
  onInserted()
}

/**
 * Bring the caret — just moved to the end of the inserted content — into view.
 * Focus alone left the inserted text off-screen when the editor's last caret
 * was outside the viewport, which read as "Insert did nothing" (#147).
 */
function focusInsertionEnd(editor: Editor): void {
  scrollEditorToPos(editor, editor.state.selection.from)
}
