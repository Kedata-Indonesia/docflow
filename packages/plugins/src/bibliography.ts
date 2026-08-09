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
 * Bibliography — a fully derived block. It stores NOTHING (no attrs): the
 * node view renders the engine's citeproc-sorted entries and repaints on
 * every engine change (source edit, style switch, citation add/remove).
 */
export const BibliographyNode = Node.create({
  name: 'bibliography',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

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

      const render = () => {
        const engine = getEngine(editor)
        const items = engine?.getBibliography() ?? []
        dom.innerHTML = ''
        if (items.length === 0) {
          const placeholder = document.createElement('p')
          placeholder.className = 'docs-bibliography__empty'
          placeholder.textContent = 'Bibliography'
          dom.appendChild(placeholder)
          return
        }
        const heading = document.createElement('h2')
        heading.className = 'docs-bibliography__heading'
        heading.textContent = 'Bibliography'
        dom.appendChild(heading)
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
          return updatedNode?.type?.name === 'bibliography'
        },
        destroy() {
          unsubscribe?.()
        },
      }
    }
  },
})
