/**
 * Adapter from `AIProvider` (the object shape) to `AIStreamFn` (the function
 * port declared on `EditorOptions`) — plan §4.2. Lets hosts pass whichever
 * shape they have:
 *
 *   createEditor({ aiStream: toAIStreamFn(openaiCompatibleProvider({...})) })
 *
 * Prompt assembly (`AIActionRequest` → system + user prompt) happens here via
 * `buildAIPrompt`; the provider only sees prompt-in / tokens-out. StreamEvent
 * semantics are flattened to the `AIStreamFn` contract: deltas become text
 * chunks, `done` ends the stream, `error` throws.
 */
import { buildAIPrompt } from './prompts.js'
import type { AIProvider } from './provider.js'
import type { AIActionRequest, AIStreamFn } from './types.js'

export function toAIStreamFn(provider: AIProvider): AIStreamFn {
  return async function* aiStream(req: AIActionRequest, signal: AbortSignal) {
    const { system, prompt } = buildAIPrompt(req)
    for await (const event of provider.complete({ system, prompt, signal })) {
      if (event.type === 'delta') {
        yield event.text
      } else if (event.type === 'done') {
        return
      } else {
        throw event.error
      }
    }
  }
}
