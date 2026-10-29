import type { Editor } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'

import {
  CODE_BLOCK,
  INDENT_ATTR,
  INDENTABLE_NODES,
  LIST_ITEM_NODES,
  clampIndentLevel,
  indentLevelOf,
} from './indentLevel.js'

/**
 * TipTap's command `dispatch` ignores its argument and commits the `tr` handed
 * to the command, so every mutation below has to happen on that transaction.
 */
type Dispatch = (() => void) | undefined

/** Only the slice of TipTap's command props this module needs. */
export interface IndentProps {
  editor: Editor
  state: EditorState
  tr: Transaction
  dispatch: Dispatch
  commands: {
    sinkListItem: (typeOrName: string) => boolean
    liftListItem: (typeOrName: string) => boolean
  }
}

/**
 * Apply `resolve(current)` to every indentable block touched by the selection.
 * `tr` is mutated in place and dispatched once; returns whether anything moved.
 */
function updateBlockIndent(
  props: IndentProps,
  resolve: (current: number) => number,
): boolean {
  const { state, tr } = props
  const { from, to } = state.selection
  let changed = false

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!INDENTABLE_NODES.includes(node.type.name)) return
    const current = indentLevelOf(node)
    const next = resolve(current)
    if (next === current) return
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [INDENT_ATTR]: next })
    changed = true
  })

  if (changed) props.dispatch?.()
  return changed
}

/** Shift every indentable block touched by the selection by `delta` levels. */
function shiftBlockIndent(props: IndentProps, delta: number): boolean {
  return updateBlockIndent(props, (current) => clampIndentLevel(current + delta))
}

/** Set an absolute indent level on every block touched by the selection. */
export function setBlockIndent(props: IndentProps, level: number): boolean {
  const target = clampIndentLevel(level)
  return updateBlockIndent(props, () => target)
}

/** Offsets (inside the code block text) where each covered line starts. */
function coveredCodeLineStarts(state: EditorState): number[] | null {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== CODE_BLOCK || !$from.sameParent($to)) return null

  const text = $from.parent.textContent
  const first = text.lastIndexOf('\n', Math.max($from.parentOffset - 1, 0)) + 1
  const breakAt = text.indexOf('\n', $to.parentOffset)
  const end = breakAt === -1 ? text.length : breakAt

  const starts: number[] = []
  for (let at = first; at <= end; at++) {
    if (at === first || text[at - 1] === '\n') starts.push(at)
  }
  return starts
}

/** One leading tab, or up to two leading spaces (soft-tab round-trip). */
const LEADING_INDENT = /^(?:\t| {1,2})/

/**
 * Tab inside a code block edits literal whitespace instead of the outline: a
 * collapsed cursor gets a tab at the caret, a multi-line selection gains (or
 * loses) one leading tab per covered line. Returns false when the selection
 * does not sit inside a single code block.
 */
function shiftCodeBlockIndent(props: IndentProps, delta: 1 | -1): boolean {
  const starts = coveredCodeLineStarts(props.state)
  if (!starts) return false

  // Collapsed selection: insert at the caret, like an editor's Tab, instead of
  // jumping the edit to column 0 of the line.
  if (delta > 0 && props.state.selection.empty) {
    props.tr.insertText('\t')
    props.dispatch?.()
    return true
  }

  const text = props.state.selection.$from.parent.textContent
  const blockStart = props.state.selection.$from.start()
  const { tr } = props

  // Walk right-to-left so earlier offsets stay valid while inserting/deleting.
  for (let i = starts.length - 1; i >= 0; i--) {
    const at = blockStart + starts[i]
    if (delta > 0) {
      tr.insertText('\t', at, at)
      continue
    }
    const leading = LEADING_INDENT.exec(text.slice(starts[i]))?.[0]
    if (leading) tr.delete(at, at + leading.length)
  }

  const changed = delta > 0 || tr.docChanged
  if (changed) props.dispatch?.()
  return changed
}

/**
 * Tab / Shift-Tab resolution order (Google Docs behaviour): code block →
 * literal whitespace, list → nest/unnest, otherwise → block indent. Levels are
 * clamped, so Tab is a no-op at the extremes.
 */
export function runIndent(props: IndentProps, delta: 1 | -1): boolean {
  if (props.editor.isActive(CODE_BLOCK)) return shiftCodeBlockIndent(props, delta)

  const listItem = LIST_ITEM_NODES.find((name) => props.editor.isActive(name))
  if (listItem) {
    const nested =
      delta > 0
        ? props.commands.sinkListItem(listItem)
        : props.commands.liftListItem(listItem)
    // A first-level item cannot sink any deeper — fall through, so Tab still
    // indents its text instead of dead-ending.
    if (nested) return true
  }

  return shiftBlockIndent(props, delta)
}

/**
 * Issue #189 (second round): with the caret at the very start of an indented
 * block, Backspace/Delete must step the block out one level instead of deleting
 * content — Google Docs behaviour. Before this the only way back was Shift-Tab,
 * and pressing Backspace at the start of an indented paragraph left the indent
 * behind.
 *
 * Only blocks carrying the `indent` attribute are affected: code blocks keep
 * their literal indentation and list items un-nest through the list keymap.
 */
export function outdentAtBlockStart(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false
  if (editor.isActive(CODE_BLOCK)) return false

  const { $from } = selection
  if ($from.parentOffset > 0) return false
  if (!INDENTABLE_NODES.includes($from.parent.type.name)) return false
  if (indentLevelOf($from.parent) <= 0) return false

  return editor.commands.outdent()
}
