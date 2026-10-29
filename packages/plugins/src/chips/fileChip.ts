import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import { createChipDom, renderIconLabel, simpleChipView } from './chipShared.js'

/** Workspace-file link pill. */
export const FileChipNode = Node.create({
  name: 'fileChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      fileId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-file-id') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => (attrs.fileId ? { 'data-file-id': attrs.fileId } : {}),
      },
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-name') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-name': attrs.name ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="file-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'file-chip',
      class: 'docs-chip docs-chip--file',
    }), node.attrs.name || 'file']
  },

  addNodeView(): NodeViewRenderer {
    return simpleChipView(
      'fileChip',
      () => createChipDom('file', 'file-chip'),
      (dom, node) => renderIconLabel(dom, '🗎', node.attrs.name || 'Untitled file'),
    )
  },
})
