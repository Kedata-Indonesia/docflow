import { Extension, Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import type { Editor, NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import katex from 'katex'
import { definePlugin } from '@kedata-indonesia/docflow-core'

/**
 * Equation (LaTeX) — issue #255 (C1).
 *
 * Two atom nodes, never one: ProseMirror nodes are either inline or block.
 * Only `latex` (+ `numbered`/`label` on display) is persisted; the rendered
 * output is a derived view, exactly like citations — two clients with the
 * same source render identically, so Yjs stays conflict-free.
 *
 * Editing is transient: it lives in the NodeView / `editor.storage.equation`
 * and is never written to the document.
 */

/** Shared transient edit state (C1: one equation at a time). */
export interface EquationStorage {
  editingPos: number | null
}

const KATEX_OPTIONS = {
  throwOnError: false,
  // Never let user LaTeX reach raw HTML, \href or \includegraphics.
  trust: false,
  strict: 'ignore' as const,
  output: 'htmlAndMathml' as const,
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * KaTeX renders synchronously to HTML + MathML. With `trust: false` its output
 * is safe to inject: dangerous commands are escaped as text, not executed.
 */
export function renderEquation(latex: string, displayMode = false): string {
  const source = latex.trim()
  if (!source) return '<span class="docs-equation__placeholder">Empty equation</span>'
  try {
    return katex.renderToString(source, { ...KATEX_OPTIONS, displayMode })
  } catch {
    return `<span class="docs-equation__error">${escapeHtml(source)}</span>`
  }
}

function readLatex(node: PMNode): string {
  return String((node.attrs as { latex?: unknown }).latex ?? '')
}

/**
 * Derived display-equation numbering (C2, issue #256): only `numbered`
 * equations consume a number, in document order. The number is written to the
 * NodeView's `[data-equation-number]` slot — never to attrs — so it cannot
 * mutate the document or re-trigger the transaction that produced it.
 */
export function updateEquationNumbers(view: EditorView): void {
  const numbers: string[] = []
  let n = 0
  view.state.doc.descendants((node) => {
    if (node.type.name !== 'displayEquation') return
    if (node.attrs.numbered) {
      n += 1
      numbers.push(`(${n})`)
    } else {
      numbers.push('')
    }
  })
  view.dom.querySelectorAll<HTMLElement>('[data-equation-number]').forEach((slot, index) => {
    const value = numbers[index] ?? ''
    if (slot.textContent !== value) slot.textContent = value
  })
}

function insertDisplayNode(
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

function focusEditor(editor: Editor): void {
  try {
    editor.commands.focus()
  } catch {
    /* the view can be torn down while a NodeView commits */
  }
}

function deleteEquation(editor: Editor, pos: number, node: PMNode): boolean {
  const view = editor.view
  if (!view) return false
  const tr = view.state.tr.delete(pos, pos + node.nodeSize)
  view.dispatch(tr)
  focusEditor(editor)
  return true
}

function setLatex(editor: Editor, pos: number, node: PMNode, latex: string): boolean {
  const view = editor.view
  if (!view) return false
  // Read the live node so attrs changed while the source editor was open
  // (e.g. `numbered` from the C2 toggle) are preserved on commit.
  const current = view.state.doc.nodeAt(pos) ?? node
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, latex }))
  focusEditor(editor)
  return true
}

const InlineEquationNode = Node.create({
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

      const setEditingPos = (pos: number | null) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).equation as EquationStorage | undefined
        if (storage) storage.editingPos = pos
      }

      const cleanup = () => {
        input?.remove()
        input = null
        render.hidden = false
        setEditingPos(null)
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
        if (typeof pos === 'number') setEditingPos(pos)
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
        input.addEventListener('blur', () => commit())
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

const DisplayEquationNode = Node.create({
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

      const setEditingPos = (pos: number | null) => {
        const storage = (editor.storage as unknown as Record<string, unknown>).equation as EquationStorage | undefined
        if (storage) storage.editingPos = pos
      }

      const cleanup = () => {
        input?.remove()
        input = null
        toggle?.remove()
        toggle = null
        body.hidden = false
        setEditingPos(null)
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
        if (typeof pos === 'number') setEditingPos(pos)
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
        input.addEventListener('blur', () => commit())
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
            update: (view) => updateEquationNumbers(view),
          }
        },
      }),
    ]
  },
})

export const equationPlugin = definePlugin({
  id: 'equation',
  tiptapExtensions: [EquationState, InlineEquationNode, DisplayEquationNode],
  toolbar: [
    {
      id: 'insert-inline-equation',
      label: 'Inline equation',
      labelKey: 'header.inlineEquation',
      action: 'insertInlineEquation',
      iconComponent: 'Sigma',
    },
    {
      id: 'insert-equation',
      label: 'Equation',
      labelKey: 'header.equation',
      action: 'insertDisplayEquation',
      iconComponent: 'Sigma',
    },
    {
      id: 'insert-numbered-equation',
      label: 'Numbered equation',
      labelKey: 'header.numberedEquation',
      action: 'insertNumberedEquation',
      iconComponent: 'Sigma',
    },
  ],
  slashCommands: [
    { name: 'Inline equation', nameKey: 'header.inlineEquation', command: 'insertInlineEquation' },
    { name: 'Equation', nameKey: 'header.equation', command: 'insertDisplayEquation' },
    { name: 'Numbered equation', nameKey: 'header.numberedEquation', command: 'insertNumberedEquation' },
  ],
  commands: {
    insertInlineEquation: (editor: Editor, ...args: unknown[]) => {
      const latex = (args[0] as { latex?: string } | undefined)?.latex ?? ''
      return editor
        .chain()
        .focus()
        .insertContent({ type: 'inlineEquation', attrs: { latex } })
        .run()
    },
    insertDisplayEquation: (editor: Editor, ...args: unknown[]) => {
      const attrs = args[0] as { latex?: string; numbered?: boolean; label?: string | null } | undefined
      return insertDisplayNode(editor, attrs?.numbered ?? false, attrs)
    },

    insertNumberedEquation: (editor: Editor, ...args: unknown[]) => {
      const attrs = args[0] as { latex?: string; label?: string | null } | undefined
      return insertDisplayNode(editor, true, attrs)
    },
  },
})

export const inlineEquationNode = InlineEquationNode
export const displayEquationNode = DisplayEquationNode
