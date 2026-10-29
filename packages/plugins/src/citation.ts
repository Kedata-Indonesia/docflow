import { definePlugin } from '@kedata-indonesia/docflow-core'
import { CiteEngine } from './citeEngine.js'
import { BibliographyNode, ReferenceListNode } from './bibliography.js'
import { citationCommands } from './citation/citationCommands.js'
import { CitationNode } from './citation/citationNode.js'
import {
  CitationEngineExtension,
  editorContext,
  type CitationStorage,
} from './citation/citationStorage.js'

export { buildCitationNodes } from './citationNodeSpec.js'
export { CitationNode } from './citation/citationNode.js'
export { CitationEngineExtension, getCitationEngine } from './citation/citationStorage.js'
export type { CitationStorage } from './citation/citationStorage.js'

/**
 * Citation plugin manifest.
 *
 * The pieces live next to this file so each one stays small and independently
 * testable: `citation/citationStorage.ts` owns the per-editor engine + the
 * document↔engine sync (repair, recompute, footnote persistence),
 * `citation/citationNode.ts` the inline node view, `citation/citationCommands.ts`
 * the insert/style commands.
 */
export const citationPlugin = definePlugin({
  id: 'citation',
  tiptapExtensions: [CitationEngineExtension, CitationNode, ReferenceListNode, BibliographyNode],
  toolbar: [
    {
      id: 'insert-citation',
      label: 'Citation',
      action: 'insertCitation',
      iconComponent: 'Quote',
    },
    {
      id: 'insert-reference-list',
      label: 'Reference list',
      labelKey: 'header.referenceList',
      action: 'insertReferenceList',
      iconComponent: 'List',
    },
    {
      id: 'insert-bibliography',
      label: 'Bibliography',
      labelKey: 'header.bibliography',
      action: 'insertBibliography',
      iconComponent: 'FileText',
    },
  ],
  slashCommands: [
    { name: 'Citation', command: 'insertCitation' },
    { name: 'Reference list', nameKey: 'header.referenceList', command: 'insertReferenceList' },
    { name: 'Bibliography', nameKey: 'header.bibliography', command: 'insertBibliography' },
  ],
  commands: citationCommands,

  hooks: {
    onInit(editor) {
      const citation = editorContext(editor)?.citation
      if (!citation) return // inert without the injected port — like onImageUpload
      const sources =
        typeof citation.sources === 'function' ? citation.sources() : citation.sources
      const engine = new CiteEngine({ sources, style: citation.style, styles: citation.styles })
      const storage = editor.storage as unknown as { citationEngine: CitationStorage }
      storage.citationEngine.engine = engine
    },
    onDestroy(editor) {
      const storage = editor.storage as unknown as { citationEngine: CitationStorage }
      storage.citationEngine.engine = null
    },
  },
})
