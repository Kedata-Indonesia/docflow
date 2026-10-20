import './styles/index.css'

export { useEditor, type UseEditorOptions, type UseEditorReturn } from './composables/useEditor.js'
export { useAIProvider, type UseAIProviderReturn } from './composables/useAIProvider.js'

// AI ports — re-exported so embedded consumers wire AI without reaching into
// core internals (docs/plans/PLUGGABLE_AI_PROVIDER.md §8.2).
export {
  openaiCompatibleProvider,
  claudeProvider,
  toAIStreamFn,
  memoryKeyStorage,
  localStorageKeyStorage,
  sessionStorageKeyStorage,
  httpKeyStorage,
  type OpenAICompatibleConfig,
  type ClaudeConfig,
  type AIProvider,
  type StreamEvent,
  type AIConfig,
  type Auth,
  type KeyStorage,
  type HttpKeyStorageUrls,
  type BrowserKeyStorageOptions,
  type AIStreamFn,
  type AIDraftFn,
} from '@kedata-indonesia/docflow-core'
export { useTheme } from './composables/useTheme.js'
// Issue #144 — zoom presets shared with hosts that build their own zoom UI.
export {
  ZOOM_PRESETS,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  normalizeZoom,
} from './composables/useEditorZoom.js'
export { useLocale, provideLocale, getLocaleName, getSupportedLocales, type Locale } from './composables/useLocale.js'
export { messages, defaultLocale, getLocaleMessages, isLocale, type Messages, type TranslationKey } from './locales/index.js'
// Issue #153 — the derived list of header menu actions a host has to implement
// itself. Pass it (or a subset) to `<DocsEditor :unimplemented-actions="…">`.
export { HOST_OWNED_ACTIONS } from './components/menuActions.js'
export { default as DocsEditor } from './components/DocsEditor.vue'
export { default as EditorToolbar } from './components/EditorToolbar.vue'
export { default as PageView } from './components/PageView.vue'
export { default as HeaderBar } from './components/HeaderBar.vue'
export { default as StatusBar } from './components/StatusBar.vue'
export { default as BubbleMenu } from './components/BubbleMenu.vue'
export { default as ThemeToggle } from './components/ThemeToggle.vue'
export { default as DetailsDialog } from './components/DetailsDialog.vue'
export { default as EmailDialog } from './components/EmailDialog.vue'
export { default as AISidebar } from './components/sidebars/AISidebar.vue'
export { default as CommentsSidebar } from './components/sidebars/CommentsSidebar.vue'
export { default as HistorySidebar } from './components/sidebars/HistorySidebar.vue'
export { default as TOCSidebar } from './components/sidebars/TOCSidebar.vue'
export { default as DocumentTabsSidebar } from './components/DocumentTabsSidebar.vue'
export { default as SlashMenu } from './components/SlashMenu.vue'
export type * from './types.js'
export type { DocumentMode } from '@kedata-indonesia/docflow-core'
export { DOCUMENT_MODES } from '@kedata-indonesia/docflow-core'