import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { getCitationEngine } from './citationStorage.js'

/**
 * Inline citation — `{ sourceId, locator, … }` only. The visible text is
 * derived by the CiteEngine at render time and is NEVER stored in the
 * document (the #1 correctness invariant of the phase-6 design: two clients
 * with the same sources + style derive identical output through Yjs).
 */
export const CitationNode = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      citationId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-citation-id'),
        renderHTML: (attrs) => ({ 'data-citation-id': attrs.citationId }),
      },
      sourceId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-citation-source-id'),
        renderHTML: (attrs) => ({ 'data-citation-source-id': attrs.sourceId }),
      },
      locator: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-citation-locator') ?? '',
        renderHTML: (attrs) => ({ 'data-citation-locator': attrs.locator }),
      },
      label: {
        default: 'page',
        parseHTML: (el) => el.getAttribute('data-citation-label') ?? 'page',
        renderHTML: (attrs) => ({ 'data-citation-label': attrs.label }),
      },
      mode: {
        default: 'normal',
        parseHTML: (el) => el.getAttribute('data-citation-mode') ?? 'normal',
        renderHTML: (attrs) => ({ 'data-citation-mode': attrs.mode }),
      },
      prefix: { default: '' },
      suffix: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="citation"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Used for copy-paste/HTML export only. The live editor uses addNodeView.
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-node-type': 'citation',
        class: 'docs-citation',
      }),
      '',
    ]
  },

  addNodeView(): NodeViewRenderer {
    return (props) => {
      const editor = props.editor
      const node = props.node

      const dom = document.createElement('span')
      dom.className = 'docs-citation'
      dom.setAttribute('data-node-type', 'citation')

      // Repaint from the engine — the single source of truth for citation text.
      const render = () => {
        const engine = getCitationEngine(editor)
        const citationId = node.attrs.citationId as string | null
        const text = engine && citationId ? engine.renderCluster(citationId) : ''
        if (text) {
          dom.innerHTML = text
          dom.classList.remove('docs-citation--missing')
        } else {
          dom.textContent = '[?]'
          dom.classList.add('docs-citation--missing')
        }
        dom.setAttribute('data-citation-id', String(node.attrs.citationId ?? ''))
        dom.setAttribute('data-citation-source-id', String(node.attrs.sourceId ?? ''))
      }

      render()

      const engine = getCitationEngine(editor)
      const unsubscribe = engine?.onChange(render)

      return {
        dom,
        update(updatedNode: PMNode): boolean {
          if (updatedNode.type.name !== 'citation') return false
          try {
            Object.assign(node.attrs, updatedNode.attrs)
            render()
          } catch { /* ignore */ }
          return true
        },
        destroy() {
          unsubscribe?.()
        },
      }
    }
  },
})
