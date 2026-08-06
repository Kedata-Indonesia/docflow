export { createEditor, sanitizePastedHTML, type EditorOptions, type DocsEditor } from './Editor.js'
export {
  PerformanceMonitor,
  createPerformanceMonitor,
  type PerformanceMonitorOptions,
  type MonitorMetric,
} from './PerformanceMonitor.js'
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
export {
  SubdocumentProvider,
  type SubdocState,
  type SubdocumentProviderOptions,
} from './SubdocumentProvider.js'
export type { AIAction, AIActionRequest, AIStreamFn, AIDraftFn, AIDraftEvent, AIDraftCitation, AIProviderFactory } from './ai/types.js'
export type { StreamEvent, AICompleteRequest, AIProvider } from './ai/provider.js'
export { toAIStreamFn } from './ai/adapter.js'
export { buildAIPrompt, trimContextBefore, trimContextAfter, CONTEXT_CHAR_CAP } from './ai/prompts.js'
export {
  type Auth,
  type AIConfig,
  type KeyStorage,
  type HttpKeyStorageUrls,
  LOCAL_STORAGE_KEY,
  memoryKeyStorage,
  localStorageKeyStorage,
  httpKeyStorage,
} from './ai/keyStorage.js'
export { openaiCompatibleProvider, type OpenAICompatibleConfig } from './ai/openaiCompatibleProvider.js'
