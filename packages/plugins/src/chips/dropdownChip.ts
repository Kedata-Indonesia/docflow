import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { createChipDom, DEFAULT_STATUSES, resolvePos } from './chipShared.js'

/** Status dropdown pill (To Do / In Progress / …). */
export const DropdownChipNode = Node.create({
  name: 'dropdownChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      options: {
        default: DEFAULT_STATUSES,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-options') ?? ''
          const list = raw ? raw.split('|') : []
          return list.length ? list : DEFAULT_STATUSES
        },
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-options': (Array.isArray(attrs.options) ? attrs.options : []).join('|'),
        }),
      },
      selected: {
        default: DEFAULT_STATUSES[0],
        parseHTML: (el: HTMLElement) => el.getAttribute('data-selected') ?? DEFAULT_STATUSES[0],
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-selected': attrs.selected ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="dropdown-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'dropdown-chip',
      class: 'docs-chip docs-chip--dropdown',
    }), node.attrs.selected || '']
  },

  addNodeView(): NodeViewRenderer {
    return (props) => {
      let currentNode = props.node
      const getPos = () => resolvePos(props)
      const view = props.view

      const dom = createChipDom('dropdown', 'dropdown-chip')

      const render = () => {
        const opts: string[] = currentNode.attrs.options ?? DEFAULT_STATUSES
        const sel: string = currentNode.attrs.selected ?? (opts[0] ?? '')
        const select = document.createElement('select')
        select.className = 'docs-chip-select'
        // Stop ProseMirror from treating the click as a node-selection drag.
        select.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation())
        for (const opt of opts) {
          const o = document.createElement('option')
          o.value = opt
          o.textContent = opt
          if (opt === sel) o.selected = true
          select.appendChild(o)
        }
        select.addEventListener('change', () => {
          const pos = getPos()
          if (typeof pos === 'number') {
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              selected: select.value,
            }))
          }
        })
        dom.replaceChildren(select)
      }
      render()

      return {
        dom,
        update(updatedNode: PMNode): boolean {
          if (updatedNode.type.name !== 'dropdownChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})
