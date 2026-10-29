import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { setEditingPos } from './state.js'
import { deleteEquation, focusEditor, setLatex } from './transactions.js'
import { readLatex, renderEquation } from './render.js'

/**
 * Inline equation atom. Editing is transient: it lives in the NodeView (and
 * `editor.storage.equation`) and is never written to the document.
 */
export const InlineEquationNode = Node.create({
  name: 'inlineEquation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="inlineEquation"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-node-type': 'inlineEquation',
        class: 'docs-equation docs-equation--inline',
      }),
      readLatex(node),
    ]
  },

  addNodeView(): NodeViewRenderer {
    return ({ node, editor, getPos }) => {
      let current = readLatex(node)
      let input: HTMLInputElement | null = null

      const dom = document.createElement('span')
      dom.className = 'docs-equation docs-equation--inline'
      dom.setAttribute('data-node-type', 'inlineEquation')
      dom.setAttribute('data-latex', current)
      dom.setAttribute('contenteditable', 'false')

      const render = document.createElement('span')
      render.className = 'docs-equation__render'
      render.innerHTML = renderEquation(current)
      dom.appendChild(render)

      function onBlur(): void {
        commit()
      }

      const cleanup = () => {
        const element = input
        input = null
        if (element) {
          // Removing a focused input can fire blur synchronously (Chromium).
          // Detach first so that blur does not re-enter commit/cleanup and
          // throw "The node to be removed is no longer a child" (#343).
          element.removeEventListener('blur', onBlur)
          element.remove()
        }
        render.hidden = false
        setEditingPos(editor, null)
      }

      const stop = () => {
        cleanup()
        render.innerHTML = renderEquation(current)
        dom.setAttribute('data-latex', current)
      }

      const commit = () => {
        if (!input) return
        const value = input.value
        const pos = getPos()
        cleanup()
        if (typeof pos !== 'number') {
          render.innerHTML = renderEquation(current)
          return
        }
        if (!value.trim()) {
          deleteEquation(editor, pos, node)
          return
        }
        current = value.trim()
        render.innerHTML = renderEquation(current)
        dom.setAttribute('data-latex', current)
        setLatex(editor, pos, node, current)
      }

      const cancel = () => {
        if (!input) return
        const pos = getPos()
        // Escape on a node that was just inserted (still empty) removes it.
        if (!current.trim() && typeof pos === 'number') {
          cleanup()
          deleteEquation(editor, pos, node)
          return
        }
        stop()
        focusEditor(editor)
      }

      const startEdit = () => {
        if (input || !editor.isEditable) return
        const pos = getPos()
        if (typeof pos === 'number') setEditingPos(editor, pos)
        render.hidden = true
        input = document.createElement('input')
        input.type = 'text'
        input.className = 'docs-equation__input'
        input.value = current
        input.setAttribute('aria-label', 'LaTeX source')
        input.setAttribute('spellcheck', 'false')
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancel()
          }
        })
        input.addEventListener('blur', onBlur)
        dom.appendChild(input)
        input.focus()
        input.select()
      }

      dom.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        startEdit()
      })

      // Inserting from the toolbar/slash lands an empty node: open the editor
      // immediately instead of making the user click it again.
      if (!current) setTimeout(() => { if (!input && dom.isConnected) startEdit() }, 0)

      return {
        dom,
        stopEvent: () => input !== null,
        ignoreMutation: () => true,
        update(updatedNode: PMNode): boolean {
          if (updatedNode.type.name !== 'inlineEquation') return false
          const next = readLatex(updatedNode)
          if (next === current) return true
          current = next
          dom.setAttribute('data-latex', current)
          if (!input) render.innerHTML = renderEquation(current)
          return true
        },
      }
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\$([^$\n]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ]
  },
})
