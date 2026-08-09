/**
 * Standalone entry point for the citation engine — NO tiptap imports. Server
 * and tooling consumers (e.g. the PDF export route) get the engine + CSL
 * assets without pulling the editor extension graph into their bundle.
 */
export {
  CiteEngine,
  nextCitationId,
  sanitizeCiteprocHtml,
  type CitationAttrs,
  type CitationMode,
  type CitationCluster,
  type CiteEngineOptions,
} from './citeEngine.js'
// Import from the spec module directly — './citation.js' carries a runtime
// definePlugin import (editor extension graph), which would defeat this
// entry's standalone purpose and drag core's barrel (incl. ESM yjs) into
// server-side consumers.
export { buildCitationNodes } from './citationNodeSpec.js'
export { CSL_STYLES, DEFAULT_CSL_STYLE, CSL_LOCALE_EN_US, type CslStyleInfo } from './csl/index.js'
