import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { updateEquationNumbers } from './render.js'
import type { EquationStorage } from './transactions.js'

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
