/**
 * Native Anthropic Claude `AIProvider` (per-user BYOK — issue #118,
 * `docs/plans/PER_USER_BYOK.md` §3.4).
 *
 * Anthropic's Messages API is not OpenAI-shaped: different endpoint
 * (`/v1/messages`), different auth (`x-api-key`), a **required** `max_tokens`, a
 * top-level `system` parameter (not a system message), and its own SSE event
 * names. This provider maps all of that onto the same `AIProvider` contract, so
 * hosts can swap it for `openaiCompatibleProvider` without changing call sites.
 *
 * Cancellation contract matches `openaiCompatibleProvider`:
 *   - a non-2xx response yields `{ type: 'error' }` (never throws out of the iterator);
 *   - an aborted `req.signal` ends the stream **silently**;
 *   - closing the iterator early aborts the in-flight `fetch` so no tokens are wasted.
 */
import type { Auth } from './keyStorage.js'
import type { AICompleteRequest, AIProvider, StreamEvent } from './provider.js'

export interface ClaudeConfig {
  /** Base URL of the Anthropic (or compatible) endpoint. Defaults to `https://api.anthropic.com`. */
  baseUrl?: string
  auth: Auth
  model: string
  /**
   * Required by the Messages API. Defaults to 4096 — omit it and every call
   * would fail with a 400.
   */
  maxTokens?: number
  /** Prepended to every call's system prompt so hosts don't repeat it. */
  systemPrompt?: string
}

const DEFAULT_BASE_URL = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096

/** Anthropic authenticates with `x-api-key`; `bearer` maps onto it. */
function authHeaders(auth: Auth): Record<string, string> {
  switch (auth.type) {
    case 'bearer':
      return { 'x-api-key': auth.apiKey }
    case 'header':
      return { [auth.name]: auth.value }
    case 'none':
      return {}
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

interface AnthropicSseEvent {
  type?: string
  delta?: { text?: string; stop_reason?: string }
  error?: { message?: string }
}

export function claudeProvider(config: ClaudeConfig): AIProvider {
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS

  return {
    async *complete(req: AICompleteRequest): AsyncIterable<StreamEvent> {
      const controller = new AbortController()
      const onAbort = () => controller.abort()
      const callerSignal = req.signal
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort()
        else callerSignal.addEventListener('abort', onAbort, { once: true })
      }

      try {
        const system = [config.systemPrompt, req.system].filter(Boolean).join('\n\n')
        const body: Record<string, unknown> = {
          model: config.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: req.prompt }],
          stream: true,
        }
        // `system` is a top-level parameter in the Messages API, not a message.
        if (system) body.system = system

        let res: Response
        try {
          res = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'anthropic-version': ANTHROPIC_VERSION,
              // Anthropic only allows browser calls with this explicit opt-in.
              'anthropic-dangerous-direct-browser-access': 'true',
              ...authHeaders(config.auth),
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          })
        } catch (err) {
          if (controller.signal.aborted) return
          yield { type: 'error', error: toError(err) }
          return
        }

        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          yield {
            type: 'error',
            error: new Error(
              `Claude provider responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
            ),
          }
          return
        }
        if (!res.body) {
          yield { type: 'error', error: new Error('Claude provider response has no body') }
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let sawDone = false
        let stopReason: string | undefined

        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            // SSE events are separated by a blank line.
            let sep: number
            while ((sep = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, sep)
              buffer = buffer.slice(sep + 2)
              for (const line of block.split('\n')) {
                if (!line.startsWith('data:')) continue
                const data = line.slice('data:'.length).trim()
                if (!data) continue
                let json: AnthropicSseEvent
                try {
                  json = JSON.parse(data) as AnthropicSseEvent
                } catch {
                  // Tolerate non-JSON SSE payloads (keep-alives, provider quirks).
                  continue
                }
                switch (json.type) {
                  case 'content_block_delta': {
                    const text = json.delta?.text
                    if (text) yield { type: 'delta', text }
                    break
                  }
                  case 'message_delta': {
                    // stop_reason arrives here, before message_stop.
                    if (json.delta?.stop_reason) stopReason = json.delta.stop_reason
                    break
                  }
                  case 'message_stop': {
                    sawDone = true
                    yield stopReason ? { type: 'done', stopReason } : { type: 'done' }
                    return
                  }
                  case 'error': {
                    yield {
                      type: 'error',
                      error: new Error(
                        json.error?.message
                          ? `Claude provider error: ${json.error.message}`
                          : 'Claude provider stream error',
                      ),
                    }
                    return
                  }
                  default:
                    break
                }
              }
            }
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            yield { type: 'error', error: toError(err) }
            return
          }
        } finally {
          reader.releaseLock()
        }

        // Stream ended without an explicit message_stop. Emit done unless aborted.
        if (!sawDone && !controller.signal.aborted) {
          yield stopReason ? { type: 'done', stopReason } : { type: 'done' }
        }
      } finally {
        callerSignal?.removeEventListener('abort', onAbort)
        // Early iterator close (accept/cancel mid-stream): abort the fetch.
        controller.abort()
      }
    },
  }
}
