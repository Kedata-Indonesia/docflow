import { Extension, type Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { updateEquationNumbers } from './render.js'

/** Shared transient edit state (one equation at a time). */
export interface EquationStorage {
  editingPos: number | null
}

/** Tell the toolbar/other views which equation is currently open for editing. */
export function setEditingPos(editor: Editor, pos: number | null): void {
  const storage = (editor.storage as unknown as Record<string, unknown>).equation as
    | EquationStorage
    | undefined
  if (storage) storage.editingPos = pos
}

/**
 * Owns `editor.storage.equation`. Kept separate from the nodes so C2 can read
 * the same storage without depending on a NodeView instance.
 */
export const EquationState = Extension.create({
  name: 'equation',

  addStorage(): EquationStorage {
    return { editingPos: null }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          updateEquationNumbers(view)
          return {
            update: (current) => updateEquationNumbers(current),
          }
        },
      }),
    ]
  },
})
