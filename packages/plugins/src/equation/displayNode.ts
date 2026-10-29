import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  deleteEquation,
  focusEditor,
  setEditingPos,
  setLatex,
} from './transactions.js'
import { readLatex, renderEquation } from './render.js'

/**
 * Display (block) equation atom with the C2 numbered toggle. The number itself
 * is derived and painted by `updateEquationNumbers`, never stored in attrs.
 */
export const DisplayEquationNode = Node.create({
  name: 'displayEquation',
  group: 'block',
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
      // C2 consumes these; keeping them in C1 means documents never need a
      // second migration when numbering lands.
      numbered: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-numbered') === 'true',
        renderHTML: (attrs) => ({ 'data-numbered': attrs.numbered ? 'true' : 'false' }),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-equation-label'),
        renderHTML: (attrs) => (attrs.label ? { 'data-equation-label': attrs.label } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="displayEquation"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-node-type': 'displayEquation',
        class: 'docs-equation-block',
      }),
      readLatex(node),
    ]
  },

  addNodeView(): NodeViewRenderer {
    return ({ node, editor, getPos }) => {
      let current = readLatex(node)
      let numbered = Boolean((node.attrs as { numbered?: unknown }).numbered)
      let input: HTMLTextAreaElement | null = null
      let toggle: HTMLLabelElement | null = null

      const dom = document.createElement('div')
      dom.className = 'docs-equation-block'
      dom.setAttribute('data-node-type', 'displayEquation')
      dom.setAttribute('data-latex', current)
      dom.setAttribute('contenteditable', 'false')

      const body = document.createElement('div')
      body.className = 'docs-equation-block__body'
      body.innerHTML = renderEquation(current, true)

      // Filled by the C2 numbering pass; hidden while empty.
      const number = document.createElement('span')
      number.className = 'docs-equation-block__number'
      number.setAttribute('data-equation-number', '')

      dom.appendChild(body)
      dom.appendChild(number)

      function onBlur(): void {
        commit()
      }

      const cleanup = () => {
        const element = input
        input = null
        if (element) {
          // Removing a focused textarea can fire blur synchronously (Chromium).
          // Detach first so blur does not re-enter commit/cleanup (#343).
          element.removeEventListener('blur', onBlur)
          element.remove()
        }
        toggle?.remove()
        toggle = null
        body.hidden = false
        setEditingPos(editor, null)
      }

      const applyNumbered = (checked: boolean) => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const currentNode = editor.state.doc.nodeAt(pos)
        if (!currentNode) return
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, numbered: checked }),
        )
      }

      const stop = () => {
        cleanup()
        body.innerHTML = renderEquation(current, true)
        dom.setAttribute('data-latex', current)
      }

      const commit = () => {
        if (!input) return
        const value = input.value
        const pos = getPos()
        cleanup()
        if (typeof pos !== 'number') {
          body.innerHTML = renderEquation(current, true)
          return
        }
        if (!value.trim()) {
          deleteEquation(editor, pos, node)
          return
        }
        current = value.trim()
        body.innerHTML = renderEquation(current, true)
        dom.setAttribute('data-latex', current)
        setLatex(editor, pos, node, current)
      }

      const cancel = () => {
        if (!input) return
        const pos = getPos()
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
        body.hidden = true
        input = document.createElement('textarea')
        input.className = 'docs-equation-block__input'
        input.rows = 2
        input.value = current
        input.setAttribute('aria-label', 'LaTeX source')
        input.setAttribute('spellcheck', 'false')
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
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

        // Numbered toggle lives in the transient editor, not in the document.
        toggle = document.createElement('label')
        toggle.className = 'docs-equation-block__number-toggle'
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = numbered
        checkbox.setAttribute('aria-label', 'Numbered equation')
        checkbox.addEventListener('change', () => {
          numbered = checkbox.checked
          applyNumbered(numbered)
        })
        toggle.appendChild(checkbox)
        toggle.appendChild(document.createTextNode(' Numbered'))
        dom.appendChild(toggle)

        input.focus()
        input.select()
      }

      dom.addEventListener('mousedown', (event) => {
        if (event.target === input) return
        if ((event.target as HTMLElement | null)?.closest('.docs-equation-block__number-toggle')) return
        event.preventDefault()
        event.stopPropagation()
        startEdit()
      })

      if (!current) setTimeout(() => { if (!input && dom.isConnected) startEdit() }, 0)

      return {
        dom,
        stopEvent: () => input !== null,
        ignoreMutation: () => true,
        update(updatedNode: PMNode): boolean {
          if (updatedNode.type.name !== 'displayEquation') return false
          numbered = Boolean((updatedNode.attrs as { numbered?: unknown }).numbered)
          const next = readLatex(updatedNode)
          if (next === current) return true
          current = next
          dom.setAttribute('data-latex', current)
          if (!input) body.innerHTML = renderEquation(current, true)
          return true
        },
      }
    }
  },
})
