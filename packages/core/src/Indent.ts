import { Extension } from '@tiptap/core'
import { outdentAtBlockStart, runIndent, setBlockIndent } from './indent/indentBlocks.js'
import {
  INDENTABLE_NODES,
  INDENT_ATTR,
  clampIndentLevel,
  parseIndentLevel,
  renderIndentAttributes,
} from './indent/indentLevel.js'

export {
  INDENT_MAX_LEVEL,
  INDENT_STEP_PX,
  INDENT_STEP_VAR,
  INDENT_STYLE_VAR,
  clampIndentLevel,
  indentLevelOf,
} from './indent/indentLevel.js'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /** Shift the block(s) in the selection one level right (Tab). */
      indent: () => ReturnType
      /** Shift the block(s) in the selection one level left (Shift-Tab). */
      outdent: () => ReturnType
      /** Set an absolute block-indent level (clamped to INDENT_MAX_LEVEL). */
      setIndent: (level: number) => ReturnType
      /** Reset the block indent of every block in the selection. */
      unsetIndent: () => ReturnType
    }
  }
}

/**
 * IndentExtension — keyboard block indentation for the docs editor.
 *
 * Issue #189: Tab used to leave the editor because nothing bound it. The
 * extension stores the level as a node attribute on paragraphs/headings,
 * renders it as `data-indent` + `margin-left`, and exposes
 * `indent` / `outdent` / `setIndent` / `unsetIndent` so the toolbar menu can
 * offer the same commands as the keyboard.
 *
 * Priority is deliberately BELOW the 100 default: Tab is already claimed by
 * richer contexts (`@tiptap/extension-list-item` nesting, table cell
 * navigation, the AI suggestion preview) and those must keep precedence. This
 * extension only runs once they have declined the key — paragraphs/headings,
 * and the first item of a list that cannot nest any deeper.
 */
export const IndentExtension = Extension.create({
  name: 'indent',
  priority: 50,

  addGlobalAttributes() {
    return [
      {
        types: [...INDENTABLE_NODES],
        attributes: {
          [INDENT_ATTR]: {
            default: 0,
            parseHTML: parseIndentLevel,
            renderHTML: (attributes) => {
              const level = clampIndentLevel(Number(attributes[INDENT_ATTR] ?? 0))
              return level > 0 ? renderIndentAttributes(level) : {}
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent: () => (props) => runIndent(props, 1),

      outdent: () => (props) => runIndent(props, -1),

      setIndent:
        (level: number) =>
        ({ state, tr, dispatch }) => {
          const changed = setBlockIndent(state, tr, level)
          if (changed) dispatch?.()
          return changed
        },

      unsetIndent: () => ({ commands }) => commands.setIndent(0),
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    }
  },
})

/**
 * Backspace/Delete outdent (#189, second round).
 *
 * A separate extension on purpose: `IndentExtension` declares `priority: 50` so Tab
 * yields to list nesting, table cell navigation and the AI preview, and a keymap at
 * that priority never sees Backspace at all — `baseKeymap` (priority 100) consumes it
 * first. This extension only claims Backspace/Delete, so it can sit above the base
 * keymap without taking Tab away from anyone.
 */
export const IndentBackspaceExtension = Extension.create({
  name: 'indentBackspace',
  priority: 150,

  addKeyboardShortcuts() {
    const outdent = () => outdentAtBlockStart(this.editor)
    return {
      Backspace: outdent,
      Delete: outdent,
    }
  },
})
