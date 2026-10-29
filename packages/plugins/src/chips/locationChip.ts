import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import { createChipDom, renderIconLabel, simpleChipView } from './chipShared.js'

/** Place/map pill. */
export const LocationChipNode = Node.create({
  name: 'locationChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-label': attrs.label ?? '' }),
      },
      lat: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-lat')
          return v === null ? null : Number(v)
        },
        renderHTML: (attrs: Record<string, unknown>) => (attrs.lat != null ? { 'data-lat': attrs.lat } : {}),
      },
      lng: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-lng')
          return v === null ? null : Number(v)
        },
        renderHTML: (attrs: Record<string, unknown>) => (attrs.lng != null ? { 'data-lng': attrs.lng } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="location-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'location-chip',
      class: 'docs-chip docs-chip--location',
    }), node.attrs.label || '']
  },

  addNodeView(): NodeViewRenderer {
    return simpleChipView(
      'locationChip',
      () => createChipDom('location', 'location-chip'),
      (dom, node) => renderIconLabel(dom, '📍', node.attrs.label || 'Add location'),
    )
  },
})
