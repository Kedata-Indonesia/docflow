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
export { fontSizePlugin, FontSizeExtension } from './fontSize.js'

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
import { fontSizePlugin } from './fontSize.js'

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
  fontSizePlugin,
]

export type { DocsEditorPlugin, ToolbarItem, SlashCommand } from '@kedata-indonesia/docflow-core'

