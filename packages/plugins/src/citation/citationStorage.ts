import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { CitationPort } from '@kedata-indonesia/docflow-core'
import type { CiteEngine } from '../citeEngine.js'
import { nextCitationId, type CitationAttrs } from '../citeEngine.js'

interface EditorContextStorage {
  citation?: CitationPort
}

/** editor.storage.citationEngine — owned by CitationEngineExtension. */
export interface CitationStorage {
  engine: CiteEngine | null
}

export function getCitationEngine(editor: Editor): CiteEngine | null {
  const storage = editor.storage as unknown as Record<string, unknown>
  if (!storage.citationEngine) return null
  return (storage as unknown as { citationEngine: CitationStorage }).citationEngine.engine ?? null
}

function editorContext(editor: Editor): EditorContextStorage | undefined {
  return (editor.storage as unknown as Record<string, unknown>).editorContext as
    | EditorContextStorage
    | undefined
}

/**
 * Repair duplicate citationIds: copy-pasting a citation clones the node WITH its
 * id — two clusters sharing an id collapse into one engine entry and every
 * occurrence renders the LAST computed form (wrong). The later occurrences get
 * fresh ids; the caller then recomputes so the repaired ids get their own
 * clusters.
 *
 * Deliberately no `return` after dispatching: TipTap v3 coalesces transactions
 * dispatched from inside a lifecycle hook, so the hook does not run again for
 * our own repair (v2 did). Falling through lets the recompute read the repaired
 * ids from `editor.state` in the same pass.
 */
function repairDuplicateCitationIds(editor: Editor): void {
  const seen = new Set<string>()
  const repairs: Array<{ pos: number; attrs: Record<string, unknown> }> = []

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'citation' || (node.type.name === 'footnote' && node.attrs.sourceId)) {
      const id = node.attrs.citationId as string | null
      if (!id) return true
      if (seen.has(id)) {
        repairs.push({ pos, attrs: { ...node.attrs } })
      } else {
        seen.add(id)
      }
    }
    return true
  })

  if (repairs.length === 0) return

  const tr = editor.state.tr
  for (const { pos, attrs } of repairs) {
    tr.setNodeMarkup(pos, undefined, { ...attrs, citationId: nextCitationId() })
  }
  editor.view.dispatch(tr)
}

/** Citation nodes + citation-backed footnotes, in document order. */
function collectOrderedClusters(editor: Editor): Array<{ citationId: string; attrs: CitationAttrs }> {
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

  return ordered
}

/**
 * Persist the engine's rendered text into citation-backed footnote `content`
 * attrs so the text survives document reloads — same persistence model as typed
 * footnotes. The engine can still re-render on style/source changes.
 */
function persistFootnoteContent(editor: Editor, engine: CiteEngine): void {
  const updates: Array<{ pos: number; content: string }> = []

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnote' && node.attrs.sourceId) {
      const id = node.attrs.citationId as string | null
      if (!id) return true
      const text = engine.renderCluster(id)
      if (text && text !== (node.attrs.content as string)) {
        updates.push({ pos, content: text })
      }
    }
    return true
  })

  if (updates.length === 0) return

  const tr = editor.state.tr
  for (const { pos, content } of updates) {
    const node = editor.state.doc.nodeAt(pos)
    if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, content })
  }
  editor.view.dispatch(tr)
}

/**
 * Carries the document-scoped CiteEngine in editor storage. The engine is
 * created by citationPlugin.hooks.onInit (from the injected CitationPort) and
 * disposed on destroy — one instance per editor, never per node.
 */
export const CitationEngineExtension = Extension.create({
  name: 'citationEngine',

  addStorage() {
    return {
      engine: null as CiteEngine | null,
    }
  },

  /**
   * Keep the engine's cluster registry in sync with the document: walk the PM
   * doc after every update, collect citation nodes AND citation-backed
   * footnotes in document order, and hand them to the engine. The engine
   * recomputes only when the ordered signature changed, so plain typing costs
   * one cheap walk and no citeproc work.
   */
  onUpdate(this: { editor: Editor }): void {
    const editor = this.editor
    const engine = getCitationEngine(editor)
    if (!engine) return

    repairDuplicateCitationIds(editor)

    const changed = engine.syncCitations(collectOrderedClusters(editor))
    if (changed) {
      editorContext(editor)?.citation?.onSourcesChange?.(engine.getCitedSourceIds())
    }

    persistFootnoteContent(editor, engine)
  },
})

export { editorContext }
