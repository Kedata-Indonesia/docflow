export { createEditor, sanitizePastedHTML, type EditorOptions, type DocsEditor } from './Editor.js'
export { normalizeClipboardHTML, detectClipboardSource, type ClipboardSource } from './pasteNormalization.js'
export { sanitizeInlineHTML } from './sanitizeInlineHTML.js'
export {
  PerformanceMonitor,
  createPerformanceMonitor,
  type PerformanceMonitorOptions,
  type MonitorMetric,
} from './PerformanceMonitor.js'
export { BlockAttributesExtension } from './BlockAttributes.js'
export { KeepTogetherExtension, planKeepTogetherSpacers, type KeepTogetherOptions } from './KeepTogether.js'
export {
  IndentExtension,
  clampIndentLevel,
  indentLevelOf,
  INDENT_STEP_PX,
  INDENT_MAX_LEVEL,
  INDENT_STYLE_VAR,
  INDENT_STEP_VAR,
} from './Indent.js'
export { FontSizeExtension } from './FontSize.js'
export { FontFamilyExtension } from './FontFamily.js'
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
export type { ImageUploadHandler, ImageUploadResult, CitationPort, CslItemData, CslStyleInfo, CslName, CslDate } from './ports.js'
export {
  detectBibliographyFormat,
  BIBLIOGRAPHY_FILE_ACCEPT,
  type BibliographyFormat,
} from './bibliographyFormats.js'
export type { DocumentMode } from './modes.js'
export { DOCUMENT_MODES } from './modes.js'
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
  purgeOfflineMirror,
  resolveMirrorKey,
  type OfflineMirrorPurgeStatus,
  type OfflineMirrorWarning,
  type PurgeOfflineMirrorOptions,
  type PurgeOfflineMirrorResult,
} from './offlineMirror.js'
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
  type BrowserKeyStorageOptions,
  LOCAL_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  memoryKeyStorage,
  localStorageKeyStorage,
  sessionStorageKeyStorage,
  httpKeyStorage,
} from './ai/keyStorage.js'
export { openaiCompatibleProvider, type OpenAICompatibleConfig } from './ai/openaiCompatibleProvider.js'
export { claudeProvider, type ClaudeConfig } from './ai/claudeProvider.js'
