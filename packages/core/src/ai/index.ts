export type { StreamEvent, AICompleteRequest, AIProvider } from './provider.js'
export { toAIStreamFn } from './adapter.js'
export { buildAIPrompt, trimContextBefore, trimContextAfter, CONTEXT_CHAR_CAP } from './prompts.js'
export {
  type Auth,
  type AIConfig,
  type KeyStorage,
  type HttpKeyStorageUrls,
  LOCAL_STORAGE_KEY,
  memoryKeyStorage,
  localStorageKeyStorage,
  httpKeyStorage,
} from './keyStorage.js'
export { openaiCompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatibleProvider.js'
