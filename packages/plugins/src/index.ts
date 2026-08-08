export { formattingPlugin } from './formatting.js'
export { headingsPlugin } from './headings.js'
export { listsPlugin } from './lists.js'
export { alignmentPlugin } from './alignment.js'
export { linkPlugin } from './link.js'
export { imagePlugin } from './image.js'
export { tablePlugin } from './table.js'
export { blockquotePlugin } from './blockquote.js'
export { codeBlockPlugin } from './codeBlock.js'
export { placeholderPlugin, createPlaceholderPlugin, type PlaceholderPluginOptions } from './placeholder.js'
export { pageBreakPlugin, PageBreak } from './pageBreak.js'
export { footnotePlugin, FootnoteNode } from './footnote.js'
export { tocPlugin, TocNode, TocEntryNode, TocPageNumNode, collectHeadings, regenerateToc } from './toc.js'
export { fontSizePlugin, FontSizeExtension } from './fontSize.js'
export { textColorPlugin } from './textColor.js'
export { highlightPlugin } from './highlight.js'
export { citationPlugin, CitationNode, CitationEngineExtension, getCitationEngine, buildCitationNodes } from './citation.js'
export { aiPlugin, AIExtension, getAIPreview, aiPluginKey, type AIPreviewState } from './ai.js'
export { markdownToFragment, insertMarkdownBlock } from './markdownInsert.js'
export { commentPlugin, CommentMarkExtension, type CommentMarkAttrs } from './comment.js'
export { BibliographyNode } from './bibliography.js'
export { CiteEngine, nextCitationId, sanitizeCiteprocHtml, type CitationAttrs, type CitationMode, type CitationCluster, type CiteEngineOptions } from './citeEngine.js'
export { CSL_STYLES, DEFAULT_CSL_STYLE, CSL_LOCALE_EN_US, type CslStyleInfo } from './csl/index.js'
export { slashMenuPlugin, SlashMenuExtension, slashState, onSlashStateChange, registerSlashCommands } from './slashMenu.js'

import { formattingPlugin } from './formatting.js'
import { headingsPlugin } from './headings.js'
import { listsPlugin } from './lists.js'
import { alignmentPlugin } from './alignment.js'
import { linkPlugin } from './link.js'
import { imagePlugin } from './image.js'
import { tablePlugin } from './table.js'
import { blockquotePlugin } from './blockquote.js'
import { codeBlockPlugin } from './codeBlock.js'
import { placeholderPlugin } from './placeholder.js'
import { pageBreakPlugin } from './pageBreak.js'
import { footnotePlugin } from './footnote.js'
import { tocPlugin } from './toc.js'
import { fontSizePlugin } from './fontSize.js'
import { textColorPlugin } from './textColor.js'
import { highlightPlugin } from './highlight.js'
import { citationPlugin } from './citation.js'
import { aiPlugin } from './ai.js'
import { commentPlugin } from './comment.js'

export const defaultPlugins = [
  formattingPlugin,
  headingsPlugin,
  listsPlugin,
  alignmentPlugin,
  linkPlugin,
  imagePlugin,
  tablePlugin,
  blockquotePlugin,
  codeBlockPlugin,
  placeholderPlugin,
  pageBreakPlugin,
  footnotePlugin,
  tocPlugin,
  fontSizePlugin,
  textColorPlugin,
  highlightPlugin,
  citationPlugin,
  aiPlugin,
  commentPlugin,
]

export type { DocsEditorPlugin, ToolbarItem, SlashCommand } from '@kedata-indonesia/docflow-core'

