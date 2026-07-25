import { Extension, Node, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { CitationPort } from '@kedata-indonesia/docflow-core'
import { CiteEngine, nextCitationId, type CitationAttrs } from './citeEngine.js'
import { BibliographyNode } from './bibliography.js'
import { buildCitationNodes } from './citationNodeSpec.js'

export { buildCitationNodes } from './citationNodeSpec.js'

interface EditorContextStorage {
  citation?: CitationPort
}

/** editor.storage.citation — owned by CitationEngineExtension. */
export interface CitationStorage {
  engine: CiteEngine | null
}

export function getCitationEngine(editor: Editor): CiteEngine | null {
  return (editor.storage as Record<string, unknown>).citation as CitationStorage | undefined
    ? ((editor.storage as unknown as { citation: CitationStorage }).citation.engine ?? null)
    : null
}

/**
 * Carries the document-scoped CiteEngine in editor storage. The engine is
 * created by citationPlugin.hooks.onInit (from the injected CitationPort) and
 * disposed on destroy — one instance per editor, never per node.
 */
export const CitationEngineExtension = Extension.create({
  name: 'citation',

  addStorage() {
    return {
      engine: null as CiteEngine | null,
    }
  },

  /**
   * Keep the engine's cluster registry in sync with the document: walk the
   * PM doc after every update, collect citation nodes AND citation-backed
   * footnotes in document order, and hand them to the engine. The engine
   * recomputes only when the ordered signature changed, so plain typing
   * costs one cheap walk and no citeproc work.
   */
  onUpdate(this: { editor: Editor }): void {
    const editor = this.editor
    const engine = getCitationEngine(editor)
    if (!engine) return

    // Repair duplicate citationIds first: copy-pasting a citation clones the
    // node WITH its id — two clusters sharing an id collapse into one engine
    // entry and every occurrence renders the LAST computed form (wrong).
    // Assign fresh ids to the later occurrences, then re-run on the next
    // update (the repair dispatch re-triggers this hook).
    {
      const seen = new Set<string>()
      const repairs: Array<{ pos: number; attrs: Record<string, unknown> }> = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'citation' || (node.type.name === 'footnote' && node.attrs.sourceId)) {
          const id = node.attrs.citationId as string | null
          if (id) {
            if (seen.has(id)) {
              repairs.push({ pos, attrs: { ...node.attrs } })
            } else {
              seen.add(id)
            }
          }
        }
        return true
      })
      if (repairs.length > 0) {
        const tr = editor.state.tr
        for (const { pos, attrs } of repairs) {
          tr.setNodeMarkup(pos, undefined, { ...attrs, citationId: nextCitationId() })
        }
        editor.view.dispatch(tr)
        return
      }
    }

    const ordered: Array<{ citationId: string; attrs: CitationAttrs }> = []
    editor.state.doc.descendants((node: PMNode, pos: number) => {
      if (node.type.name === 'citation' || (node.type.name === 'footnote' && node.attrs.sourceId)) {
        ordered.push({
          citationId: (node.attrs.citationId as string | null) ?? `anon-${pos}`,
          attrs: {
            sourceId: (node.attrs.sourceId as string | null) ?? null,
            locator: (node.attrs.locator as string) || '',
            label: (node.attrs.label as string) || 'page',
            mode: (node.attrs.mode as CitationAttrs['mode']) || 'normal',
            prefix: (node.attrs.prefix as string) || '',
            suffix: (node.attrs.suffix as string) || '',
          },
        })
      }
      return true
    })

    const changed = engine.syncCitations(ordered)
    if (changed) {
      const port = (editor.storage as Record<string, unknown>).editorContext as EditorContextStorage | undefined
      port?.citation?.onSourcesChange?.(engine.getCitedSourceIds())
    }
  },
})

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

  // Return type cast to `any` to bypass TipTap's strict NodeViewRenderer typing
  // (same pattern as FootnoteNode).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addNodeView(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const editor = props.editor as Editor
      const node = props.node ?? props

      const dom = document.createElement('span')
      dom.className = 'docs-citation'
      dom.setAttribute('data-node-type', 'citation')

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update(updatedNode: any): boolean {
          if (updatedNode?.type?.name !== 'citation') return false
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

/**
 * Build ONE citation node spec (inline `citation` or note-style `footnote`)
 * WITHOUT dispatching. Used by both the interactive `insertCitation` path
 * (which dispatches its own transaction) and the 7E-4 content-array insert
 * (which builds N nodes and dispatches once). Returns `null` only if the
 * schema lacks the required node type (note style + no `footnote` node).
 *
 * PURE: takes the engine + attrs, returns a node spec, no editor mutation.
 * Lives in `citationNodeSpec.ts` (no tiptap imports) so the standalone
 * `citations.ts` server entry can re-export it without pulling the editor
 * extension graph into the server bundle — `buildCitationNodes` should have
 * exactly ONE definition (the helper in `citationNodeSpec.ts`); this file
 * only re-exports it so existing importers keep resolving.
 */
function insertCitationWithSource(
  editor: Editor,
  engine: CiteEngine,
  attrs: { sourceId: string; locator?: string },
): boolean {
  const spec = buildCitationNodes(engine, attrs)
  if (spec.type === 'footnote' && !editor.schema.nodes['footnote']) return false
  return editor
    .chain()
    .focus()
    .insertContent({ type: spec.type, attrs: spec.attrs })
    .run()
}

export const citationPlugin = definePlugin({
  id: 'citation',
  tiptapExtensions: [CitationEngineExtension, CitationNode, BibliographyNode],
  toolbar: [{ id: 'insert-citation', label: 'Citation', action: 'insertCitation', iconComponent: 'Quote' }],
  slashCommands: [
    { name: 'Citation', command: 'insertCitation' },
    { name: 'Bibliography', command: 'insertBibliography' },
  ],
  commands: {
    /**
     * Insert a citation. Programmatic path: pass { sourceId, locator? }.
     * Interactive path: ask the host for a source via the injected
     * onSourceRequest picker (async — insertion happens on resolve, the
     * command contract stays synchronous, same as imagePlugin).
     */
    insertCitation: (editor: Editor, ...args: unknown[]) => {
      const engine = getCitationEngine(editor)
      if (!engine) {
        console.warn('[citation] no citation engine — inject the CitationPort to enable citations')
        return false
      }
      const options = args[0] as { sourceId?: string; locator?: string } | undefined
      if (options?.sourceId) {
        return insertCitationWithSource(editor, engine, { sourceId: options.sourceId, locator: options.locator })
      }
      const port = (editor.storage as Record<string, unknown>).editorContext as EditorContextStorage | undefined
      const request = port?.citation?.onSourceRequest
      if (!request) return false
      void request().then((sourceId) => {
        if (sourceId) insertCitationWithSource(editor, engine, { sourceId })
      })
      return true
    },

    /** Insert the auto-rendered bibliography (one per document). */
    insertBibliography: (editor: Editor) => {
      let exists = false
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'bibliography') exists = true
        return !exists
      })
      if (exists) return false
      return editor.chain().focus().insertContent({ type: 'bibliography' }).run()
    },

    /** Live style switch — reformats every citation + bibliography (6A-7). */
    setCitationStyle: (editor: Editor, ...args: unknown[]) => {
      const engine = getCitationEngine(editor)
      const styleId = args[0] as string | undefined
      if (!engine || !styleId) return false
      engine.setStyle(styleId)
      return true
    },
  },

  hooks: {
    onInit(editor) {
      const port = (editor.storage as Record<string, unknown>).editorContext as EditorContextStorage | undefined
      const citation = port?.citation
      if (!citation) return // inert without the injected port — like onImageUpload
      const sources = typeof citation.sources === 'function' ? citation.sources() : citation.sources
      const engine = new CiteEngine({ sources, style: citation.style })
      ;(editor.storage as unknown as { citation: CitationStorage }).citation.engine = engine
    },
    onDestroy(editor) {
      ;(editor.storage as unknown as { citation: CitationStorage }).citation.engine = null
    },
  },
})
