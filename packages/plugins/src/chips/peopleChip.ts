import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import { createChipDom, initialOf, simpleChipView } from './chipShared.js'

/** @mention pill with an avatar initial. */
export const PeopleChipNode = Node.create({
  name: 'peopleChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      userId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-user-id') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.userId ? { 'data-user-id': attrs.userId } : {}),
      },
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-name') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-name': attrs.name ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="people-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'people-chip',
      class: 'docs-chip docs-chip--people',
    }), `@${node.attrs.name || 'user'}`]
  },

  addNodeView(): NodeViewRenderer {
    return simpleChipView(
      'peopleChip',
      () => createChipDom('people', 'people-chip'),
      (dom, node) => {
        const name = node.attrs.name || 'user'
        const avatar = document.createElement('span')
        avatar.className = 'docs-chip-avatar'
        avatar.textContent = initialOf(name)
        const label = document.createElement('span')
        label.className = 'docs-chip-label'
        label.textContent = '@' + name
        dom.replaceChildren(avatar, label)
      },
    )
  },
})
