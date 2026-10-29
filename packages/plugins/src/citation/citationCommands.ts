import type { Editor } from '@tiptap/core'
import type { CiteEngine } from '../citeEngine.js'
import { buildCitationNodes } from '../citationNodeSpec.js'
import { editorContext, getCitationEngine } from './citationStorage.js'

/**
 * Plugin commands for citation insertion + style switching. Pure editor
 * commands — no TipTap extension definitions here, so they stay importable from
 * the manifest without pulling node views into the graph.
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

/** Insert a derived citation block, guarding one per document per type. */
function insertDerivedBlock(editor: Editor, type: 'referenceList' | 'bibliography'): boolean {
  let exists = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) exists = true
    return !exists
  })
  if (exists) return false
  // `citationModel: 2` marks the new all-saved-sources bibliography so the
  // legacy migration never renames it to a reference list (issue #252).
  const content = type === 'bibliography'
    ? { type, attrs: { citationModel: 2 } }
    : { type }
  // Always append at the end of the document: inserting at a NodeSelection on
  // an existing derived block would replace it.
  const end = editor.state.doc.content.size
  return editor.chain().focus().insertContentAt(end, content).run()
}

export const citationCommands = {
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
      return insertCitationWithSource(editor, engine, {
        sourceId: options.sourceId,
        locator: options.locator,
      })
    }
    const request = editorContext(editor)?.citation?.onSourceRequest
    if (!request) return false
    void request().then((sourceId) => {
      if (sourceId) insertCitationWithSource(editor, engine, { sourceId })
    })
    return true
  },

  /** Insert the cited-only reference list (one per document). */
  insertReferenceList: (editor: Editor) => insertDerivedBlock(editor, 'referenceList'),

  /** Insert the all-saved-sources bibliography (one per document). */
  insertBibliography: (editor: Editor) => insertDerivedBlock(editor, 'bibliography'),

  /** Live style switch — reformats every citation + bibliography (6A-7). */
  setCitationStyle: (editor: Editor, ...args: unknown[]) => {
    const engine = getCitationEngine(editor)
    const styleId = args[0] as string | undefined
    if (!engine || !styleId) return false
    engine.setStyle(styleId)
    return true
  },
}
