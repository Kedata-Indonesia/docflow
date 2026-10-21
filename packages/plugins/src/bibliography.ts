import { Node, mergeAttributes } from '@tiptap/core'
import type { Editor, NodeViewRenderer } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { CiteEngine } from './citeEngine.js'

interface CitationStorageLike {
  engine: CiteEngine | null
}

function getEngine(editor: Editor): CiteEngine | null {
  const storage = (editor.storage as unknown as Record<string, unknown>).citationEngine as CitationStorageLike | undefined
  return storage?.engine ?? null
}

interface DerivedCitationBlockOptions {
  name: string
  className: string
  heading: string
  getEntries: (engine: CiteEngine) => string[]
  /**
   * Persisted-model marker. The old `bibliography` node (cited-only) is renamed
   * to `referenceList` by `migrateContent`; this marker tells the migration that
   * a `bibliography` node belongs to the new all-saved-sources model instead
   * (issue #252).
   */
  model?: number
}

/**
 * A fully derived block. It stores no content: the node view renders the
 * engine's citeproc-sorted entries and repaints on every engine change (source
 * edit, style switch, citation add/remove).
 */
function createDerivedCitationBlock(options: DerivedCitationBlockOptions): Node {
  return Node.create({
    name: options.name,
    group: 'block',
    selectable: true,
    draggable: true,
    atom: true,

    addAttributes() {
      if (options.model === undefined) return {}
      return {
        citationModel: {
          default: options.model,
          parseHTML: (element: HTMLElement) =>
            Number(element.getAttribute('data-citation-model')) || options.model,
          renderHTML: () => ({}),
        },
      }
    },

    parseHTML() {
      return [{ tag: `div[data-node-type="${options.name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      const attrs: Record<string, string> = {
        'data-node-type': options.name,
        class: options.className,
      }
      if (options.model !== undefined) attrs['data-citation-model'] = String(options.model)
      return ['div', mergeAttributes(HTMLAttributes, attrs)]
    },

    addNodeView(): NodeViewRenderer {
      return (props) => {
        const editor = props.editor

        const dom = document.createElement('div')
        dom.className = options.className
        dom.setAttribute('data-node-type', options.name)

        const render = () => {
          const engine = getEngine(editor)
          const items = engine ? options.getEntries(engine) : []
          dom.innerHTML = ''
          if (items.length === 0) {
            const placeholder = document.createElement('p')
            placeholder.className = `${options.className}__empty`
            placeholder.textContent = options.heading
            dom.appendChild(placeholder)
            return
          }
          const heading = document.createElement('h2')
          heading.className = `${options.className}__heading`
          heading.textContent = options.heading
          dom.appendChild(heading)
          const list = document.createElement('div')
          list.className = `${options.className}__entries`
          for (const item of items) {
            const entry = document.createElement('p')
            entry.className = `${options.className}__entry`
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
          update(updatedNode: ProseMirrorNode): boolean {
            if (updatedNode.type.name !== options.name) return false
            render()
            return true
          },
          destroy() {
            unsubscribe?.()
          },
        }
      }
    },
  })
}

/**
 * Reference list — only the sources cited in this document (the old
 * `bibliography` semantics). Empty until a citation is inserted.
 */
export const ReferenceListNode = createDerivedCitationBlock({
  name: 'referenceList',
  className: 'docs-reference-list',
  heading: 'Reference list',
  getEntries: (engine) => engine.getReferenceList(),
})

/**
 * Bibliography — every source saved in the host library, cited or not.
 * Carries `citationModel: 2` so `migrateContent` never renames it to a
 * reference list.
 */
export const BibliographyNode = createDerivedCitationBlock({
  name: 'bibliography',
  className: 'docs-bibliography',
  heading: 'Bibliography',
  getEntries: (engine) => engine.getBibliography(),
  model: 2,
})
