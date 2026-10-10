import { afterEach, describe, expect, it, vi } from 'vitest'
import { claudeProvider } from '../claudeProvider.js'
import type { StreamEvent } from '../provider.js'

function sseResponse(chunks: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { status })
}

async function collect(iter: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = []
  for await (const e of iter) events.push(e)
  return events
}

const baseConfig = {
  baseUrl: 'https://api.anthropic.com/',
  auth: { type: 'bearer', apiKey: 'sk-ant-test' } as const,
  model: 'claude-3-5-sonnet-latest',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('claudeProvider', () => {
  it('POSTs to /v1/messages with Anthropic headers and a top-level system', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      claudeProvider({ ...baseConfig, systemPrompt: 'Be terse.' }).complete({
        system: 'Rewrite well.',
        prompt: 'hello',
      }),
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages') // trailing slash trimmed
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')

    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4096, // required by the Messages API, defaulted
      stream: true,
      system: 'Be terse.\n\nRewrite well.', // top-level, not a message
      messages: [{ role: 'user', content: 'hello' }],
    })
  })

  it('defaults the base URL and honours a custom maxTokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"type":"message_stop"}\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      claudeProvider({ auth: { type: 'header', name: 'x-api-key', value: 'k' }, model: 'claude-3-haiku', maxTokens: 256 }).complete(
        { prompt: 'x' },
      ),
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('k')
    expect(JSON.parse(init.body as string).max_tokens).toBe(256)
  })

  it('maps content_block_delta → delta and message_stop → done with the stop_reason', async () => {
    const delta = (text: string) =>
      `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`
    const event = delta('world!')
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        delta('Hello, '),
        event.slice(0, 24), // split one SSE event across two network chunks
        event.slice(24),
        `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events = await collect(claudeProvider(baseConfig).complete({ prompt: 'x' }))
    expect(events).toEqual([
      { type: 'delta', text: 'Hello, ' },
      { type: 'delta', text: 'world!' },
      { type: 'done', stopReason: 'end_turn' },
    ])
  })

  it('maps an SSE error event to an error event (does not throw)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        `event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n`,
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events = await collect(claudeProvider(baseConfig).complete({ prompt: 'x' }))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect((events[0] as { error: Error }).error.message).toContain('Overloaded')
  })

  it('yields an error event on non-OK responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('invalid api key', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const events = await collect(claudeProvider(baseConfig).complete({ prompt: 'x' }))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect((events[0] as { error: Error }).error.message).toContain('401')
    expect((events[0] as { error: Error }).error.message).toContain('invalid api key')
  })

  it('yields an error event when fetch rejects (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const events = await collect(claudeProvider(baseConfig).complete({ prompt: 'x' }))
    expect(events).toEqual([{ type: 'error', error: new Error('ECONNREFUSED') }])
  })

  it('ends silently when the caller aborts mid-stream', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events: StreamEvent[] = []
    const reading = (async () => {
      for await (const e of claudeProvider(baseConfig).complete({ prompt: 'x', signal: controller.signal })) {
        events.push(e)
      }
    })()
    controller.abort()
    await reading

    expect(events).toEqual([])
  })

  it('aborts the fetch when the consumer stops iterating early', async () => {
    let fetchSignal: AbortSignal | undefined
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      fetchSignal = init.signal as AbortSignal
      return Promise.resolve(
        sseResponse([
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'a' } })}\n\n`,
          `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: 'b' } })}\n\n`,
          `data: {"type":"message_stop"}\n\n`,
        ]),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const iter = claudeProvider(baseConfig).complete({ prompt: 'x' })[Symbol.asyncIterator]()
    const first = await iter.next()
    expect(first.value).toEqual({ type: 'delta', text: 'a' })
    await iter.return?.(undefined)

    expect(fetchSignal?.aborted).toBe(true)
  })
})
