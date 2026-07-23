export { createEditor, sanitizePastedHTML, type EditorOptions, type DocsEditor } from './Editor.js'
export { BlockAttributesExtension } from './BlockAttributes.js'
export { FontSizeExtension } from './FontSize.js'
export { EditorContextExtension, type EditorContextOptions } from './EditorContext.js'
export {
  SearchAndReplaceExtension,
  searchAndReplaceKey,
  findMatches,
  getSearchState,
  setSearchQuery,
  clearSearch,
  searchNext,
  searchPrev,
  replaceCurrent,
  replaceAll,
  type SearchMatch,
  type SearchState,
} from './SearchAndReplace.js'
export type { ImageUploadHandler, ImageUploadResult, CitationPort, CslItemData, CslName, CslDate } from './ports.js'
export { PaginationPlus, type PaginationPlusOptions, PAGE_SIZES, type PageSize } from 'tiptap-pagination-plus'
export {
  definePlugin,
  collectExtensions,
  resolveAction,
  createActionMap,
  type DocsEditorPlugin,
  type ToolbarItem,
  type SlashCommand,
} from './PluginSystem.js'
export {
  createCollaboration,
  collaborationExtensions,
  type CollaborationOptions,
  type CollaborationSetup,
  type AwarenessState,
} from './Collaboration.js'
