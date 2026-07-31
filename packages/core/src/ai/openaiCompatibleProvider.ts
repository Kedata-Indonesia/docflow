/**
 * Default `AIProvider` implementation (pluggable AI provider — issue #119,
 * plan §4.3): OpenAI-shaped `POST {baseUrl}/chat/completions` with SSE
 * streaming. Covers OpenAI, Azure-style gateways, Ollama, vLLM, and most
 * OpenAI-compatible proxies.
 *
 * Cancellation-safe: closing the async iterator early (e.g. the user accepts
 * or cancels mid-stream) aborts the in-flight `fetch`; an aborted `req.signal`
 * ends the stream silently rather than yielding an error event.
 */
import type { Auth } from './keyStorage.js'
import type { AICompleteRequest, AIProvider, StreamEvent } from './provider.js'

export interface OpenAICompatibleConfig {
  /** Base URL of the OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  auth: Auth
  model: string
  /** Prepended to every call's system prompt so hosts don't repeat it. */
  systemPrompt?: string
}

function authHeaders(auth: Auth): Record<string, string> {
  switch (auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${auth.apiKey}` }
    case 'header':
      return { [auth.name]: auth.value }
    case 'none':
      return {}
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

export function openaiCompatibleProvider(config: OpenAICompatibleConfig): AIProvider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')

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
        const messages: Array<{ role: string; content: string }> = []
        if (system) messages.push({ role: 'system', content: system })
        messages.push({ role: 'user', content: req.prompt })

        let res: Response
        try {
          res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders(config.auth) },
            body: JSON.stringify({ model: config.model, messages, stream: true }),
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
              `AI provider responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
            ),
          }
          return
        }
        if (!res.body) {
          yield { type: 'error', error: new Error('AI provider response has no body') }
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let sawDone = false

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
                if (data === '[DONE]') {
                  sawDone = true
                  yield { type: 'done' }
                  return
                }
                try {
                  const json = JSON.parse(data) as {
                    choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
                  }
                  const text = json.choices?.[0]?.delta?.content
                  if (text) yield { type: 'delta', text }
                } catch {
                  // Tolerate non-JSON SSE payloads (keep-alives, provider quirks).
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

        // Stream ended. Emit done unless the caller aborted (silent end).
        if (!sawDone && !controller.signal.aborted) yield { type: 'done' }
      } finally {
        callerSignal?.removeEventListener('abort', onAbort)
        // Reaching here on early iterator close (accept/cancel mid-stream):
        // abort the in-flight fetch so no tokens are wasted.
        controller.abort()
      }
    },
  }
}
