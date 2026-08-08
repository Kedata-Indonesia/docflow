import { Node, mergeAttributes } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  selectable: false,
  draggable: false,
  parseHTML() {
    return [{ tag: 'div[data-page-break="true"]' }]
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        'data-node-type': 'pageBreak',
        class: 'docs-editor-page-break',
      }),
      ['span', { class: 'docs-editor-page-break__label' }, 'Page break'],
    ]
  },
  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'docs-editor-page-break'
      dom.setAttribute('data-page-break', 'true')
      dom.setAttribute('data-node-type', 'pageBreak')
      dom.setAttribute('contenteditable', 'false')

      const inner = document.createElement('div')
      inner.className = 'docs-editor-page-break__inner'

      const line = document.createElement('div')
      line.className = 'docs-editor-page-break__line'

      const label = document.createElement('span')
      label.className = 'docs-editor-page-break__label-text'
      label.textContent = 'Page break'

      inner.appendChild(line)
      inner.appendChild(label)
      dom.appendChild(inner)

      return {
        dom,
        contentDOM: undefined,
      }
    }
  },
})

export const pageBreakPlugin = definePlugin({
  id: 'pageBreak',
  tiptapExtensions: [PageBreak],
  toolbar: [
    { id: 'insert-page-break', label: 'Page Break', action: 'insertPageBreak', iconComponent: 'FileText' },
  ],
  slashCommands: [{ name: 'Page Break', command: 'insertPageBreak' }],
  commands: {
    insertPageBreak: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'pageBreak' },
          { type: 'paragraph' },
        ])
        .run(),
  },
})
