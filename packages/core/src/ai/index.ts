export type { StreamEvent, AICompleteRequest, AIProvider } from './provider.js'
export type { AIAction, AIActionRequest, AIDraftCitation, AIDraftEvent, AIDraftFn, AIStreamFn } from './types.js'
export type { CslItemData, CslName, CslDate } from '../ports.js'
export { toAIStreamFn } from './adapter.js'
export { buildAIPrompt, trimContextBefore, trimContextAfter, CONTEXT_CHAR_CAP } from './prompts.js'
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
} from './keyStorage.js'
export { openaiCompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatibleProvider.js'
export { claudeProvider, type ClaudeConfig } from './claudeProvider.js'
