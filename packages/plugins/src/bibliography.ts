import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { CiteEngine } from './citeEngine.js'

interface CitationStorageLike {
  engine: CiteEngine | null
}

function getEngine(editor: Editor): CiteEngine | null {
  const storage = (editor.storage as Record<string, unknown>).citationEngine as CitationStorageLike | undefined
  return storage?.engine ?? null
}

/**
 * Bibliography — a fully derived block. It stores no entries: the node view
 * renders the engine's citeproc-sorted bibliography and repaints on every
 * engine change (source edit, style switch, citation add/remove).
 *
 * The two attrs are presentation-only, so the host can place the block under
 * an existing section heading (e.g. an NA's "Daftar Pustaka"): `showHeading`
 * suppresses the built-in heading, `headingText` relabels it. Both default to
 * the previous behaviour, so existing documents render unchanged.
 */
export const BibliographyNode = Node.create({
  name: 'bibliography',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      showHeading: {
        default: true,
        parseHTML: el => el.getAttribute('data-show-heading') !== 'false',
        renderHTML: attrs => (attrs.showHeading === false ? { 'data-show-heading': 'false' } : {}),
      },
      headingText: {
        default: 'Bibliography',
        parseHTML: el => el.getAttribute('data-heading-text') || 'Bibliography',
        renderHTML: attrs =>
          typeof attrs.headingText === 'string' && attrs.headingText !== 'Bibliography'
            ? { 'data-heading-text': attrs.headingText }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="bibliography"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-node-type': 'bibliography',
        class: 'docs-bibliography',
      }),
    ]
  },

  // Return type cast to `any` to bypass TipTap's strict NodeViewRenderer typing
  // (same pattern as FootnoteNode).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addNodeView(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const editor = props.editor as Editor

      const dom = document.createElement('div')
      dom.className = 'docs-bibliography'
      dom.setAttribute('data-node-type', 'bibliography')

      // Node views receive attrs once at setup: keep the latest ones so the
      // `update` callback can repaint when the host toggles the heading.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let attrs: any = props.node?.attrs ?? {}

      const render = () => {
        const engine = getEngine(editor)
        const items = engine?.getBibliography() ?? []
        const showHeading = attrs.showHeading !== false
        const headingText = typeof attrs.headingText === 'string' ? attrs.headingText : 'Bibliography'

        dom.innerHTML = ''
        if (items.length === 0) {
          // No entries: without a built-in heading the host already labels the
          // block (e.g. "Daftar Pustaka"), so render nothing at all.
          if (!showHeading) return
          const placeholder = document.createElement('p')
          placeholder.className = 'docs-bibliography__empty'
          placeholder.textContent = headingText
          dom.appendChild(placeholder)
          return
        }
        if (showHeading) {
          const heading = document.createElement('h2')
          heading.className = 'docs-bibliography__heading'
          heading.textContent = headingText
          dom.appendChild(heading)
        }
        const list = document.createElement('div')
        list.className = 'docs-bibliography__entries'
        for (const item of items) {
          const entry = document.createElement('p')
          entry.className = 'docs-bibliography__entry'
          entry.innerHTML = item // already sanitized by CiteEngine
          list.appendChild(entry)
        }
        dom.appendChild(list)
      }

      render()

      const engine = getEngine(editor)
      const unsubscribe = engine?.onChange(render)

      return {
        dom,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updatedNode: any): boolean {
          if (updatedNode?.type?.name !== 'bibliography') return false
          const next = updatedNode.attrs ?? {}
          const changed =
            next.showHeading !== attrs.showHeading || next.headingText !== attrs.headingText
          attrs = next
          if (changed) render()
          return true
        },
        destroy() {
          unsubscribe?.()
        },
      }
    }
  },
})
