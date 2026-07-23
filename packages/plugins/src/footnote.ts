import { Node, mergeAttributes } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

export const FootnoteNode = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      content: {
        default: '',
        parseHTML: el => el.getAttribute('data-footnote-content') ?? '',
        renderHTML: attrs => ({ 'data-footnote-content': attrs.content }),
      },
      // Phase 6: when sourceId is set, the footnote body is citeproc-rendered
      // from the source (never typed, never stored as text). The `content`
      // attr stays authoritative for free-text footnotes — existing documents
      // render byte-identically (backward compatible).
      citationId: {
        default: null,
        parseHTML: el => el.getAttribute('data-citation-id'),
        renderHTML: attrs => (attrs.citationId ? { 'data-citation-id': attrs.citationId } : {}),
      },
      sourceId: {
        default: null,
        parseHTML: el => el.getAttribute('data-footnote-source-id'),
        renderHTML: attrs => (attrs.sourceId ? { 'data-footnote-source-id': attrs.sourceId } : {}),
      },
      locator: {
        default: '',
        parseHTML: el => el.getAttribute('data-footnote-locator') ?? '',
        renderHTML: attrs => (attrs.locator ? { 'data-footnote-locator': attrs.locator } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="footnote"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Used for copy-paste/HTML export only. The live editor uses addNodeView.
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'footnote',
      class: 'docs-footnote-ref',
    }), '1']
  },

  // Return type cast to `any` to bypass TipTap's strict NodeViewRenderer typing.
  // At runtime this returns a valid ProseMirror NodeView { dom, update }.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addNodeView(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const node = props.node ?? props
      const attrs = (node && typeof node === 'object' && 'attrs' in node) ? node.attrs : {}

      const dom = document.createElement('span')
      dom.className = 'docs-footnote-ref'
      dom.setAttribute('data-node-type', 'footnote')
      dom.setAttribute('data-footnote-content', String(attrs.content ?? ''))
      if (attrs.sourceId) {
        dom.setAttribute('data-footnote-source-id', String(attrs.sourceId))
        dom.setAttribute('data-citation-id', String(attrs.citationId ?? ''))
        if (attrs.locator) dom.setAttribute('data-footnote-locator', String(attrs.locator))
      }
      // textContent is intentionally '1' — updateFootnotes() will set the real number
      dom.textContent = '1'

      return {
        dom,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updatedNode: any): boolean {
          try {
            const updatedAttrs = updatedNode?.attrs ?? {}
            dom.setAttribute('data-footnote-content', String(updatedAttrs.content ?? ''))
            if (updatedAttrs.sourceId) {
              dom.setAttribute('data-footnote-source-id', String(updatedAttrs.sourceId))
              dom.setAttribute('data-citation-id', String(updatedAttrs.citationId ?? ''))
              if (updatedAttrs.locator) dom.setAttribute('data-footnote-locator', String(updatedAttrs.locator))
            } else {
              dom.removeAttribute('data-footnote-source-id')
              dom.removeAttribute('data-citation-id')
              dom.removeAttribute('data-footnote-locator')
            }
          } catch { /* ignore */ }
          return true
        },
      }
    }
  },
})

export const footnotePlugin = definePlugin({
  id: 'footnote',
  tiptapExtensions: [FootnoteNode],
  toolbar: [
    { id: 'insert-footnote', label: 'Catatan Kaki', action: 'insertFootnote', iconComponent: 'FileText' },
  ],
  slashCommands: [{ name: 'Catatan Kaki', command: 'insertFootnote' }],
  commands: {
    insertFootnote: (editor: Editor, ...args: unknown[]) => {
      const attrs = args[0] as { content?: string } | undefined
      return editor
        .chain()
        .focus()
        .insertContent({ type: 'footnote', attrs: { content: attrs?.content ?? '' } })
        .run()
    },
  },
})
