/**
 * Document mutations shared by both equation node views. Everything here
 * dispatches through the live view so the change is a normal ProseMirror
 * transaction (and therefore a normal Yjs update).
 */

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

/** Shared transient edit state (one equation at a time). */
export interface EquationStorage {
  editingPos: number | null
}

export function insertDisplayNode(
  editor: Editor,
  numbered: boolean,
  attrs?: { latex?: string; label?: string | null },
): boolean {
  return editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'displayEquation',
        attrs: { latex: attrs?.latex ?? '', numbered, label: attrs?.label ?? null },
      },
      { type: 'paragraph' },
    ])
    .run()
}

export function focusEditor(editor: Editor): void {
  try {
    editor.commands.focus()
  } catch {
    /* the view can be torn down while a NodeView commits */
  }
}

export function deleteEquation(editor: Editor, pos: number, node: PMNode): boolean {
  const { view } = editor
  if (!view) return false
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize))
  focusEditor(editor)
  return true
}

export function setLatex(editor: Editor, pos: number, node: PMNode, latex: string): boolean {
  const { view } = editor
  if (!view) return false
  // Read the live node so attrs changed while the source editor was open
  // (e.g. `numbered` from the C2 toggle) are preserved on commit.
  const current = view.state.doc.nodeAt(pos) ?? node
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, latex }))
  focusEditor(editor)
  return true
}

/** Tell the toolbar/other views which equation is currently open for editing. */
export function setEditingPos(editor: Editor, pos: number | null): void {
  const storage = (editor.storage as unknown as Record<string, unknown>).equation as
    | EquationStorage
    | undefined
  if (storage) storage.editingPos = pos
}
