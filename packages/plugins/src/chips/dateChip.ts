import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { createChipDom, formatDate, resolvePos, todayISO } from './chipShared.js'

/** Date pill; click opens a native date picker. */
export const DateChipNode = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      date: {
        default: todayISO(),
        parseHTML: (el: HTMLElement) => el.getAttribute('data-date') ?? todayISO(),
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-date': attrs.date ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="date-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'date-chip',
      class: 'docs-chip docs-chip--date',
    }), formatDate(node.attrs.date)]
  },

  addNodeView(): NodeViewRenderer {
    return (props) => {
      let currentNode = props.node
      const getPos = () => resolvePos(props)
      const view = props.view

      const dom = createChipDom('date', 'date-chip')

      const render = () => {
        // Keep the picker open while the user is choosing.
        if (dom.querySelector('input')) return
        dom.textContent = formatDate(currentNode.attrs.date)
        dom.setAttribute('data-date', currentNode.attrs.date)
      }
      render()

      dom.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (dom.querySelector('input')) return
        const input = document.createElement('input')
        input.type = 'date'
        input.value = currentNode.attrs.date
        input.className = 'docs-chip-date-input'
        dom.replaceChildren(input)
        input.focus()
        const commit = () => {
          const newVal = input.value
          const pos = getPos()
          if (typeof pos === 'number') {
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { date: newVal }))
          }
          setTimeout(render, 30)
        }
        input.addEventListener('change', commit)
        input.addEventListener('blur', () => setTimeout(render, 30))
      })

      return {
        dom,
        update(updatedNode: PMNode): boolean {
          if (updatedNode.type.name !== 'dateChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})
