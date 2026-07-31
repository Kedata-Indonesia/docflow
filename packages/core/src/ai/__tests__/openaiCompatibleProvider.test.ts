import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiCompatibleProvider } from '../openaiCompatibleProvider.js'
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
  baseUrl: 'https://llm.example.com/v1/',
  auth: { type: 'bearer', apiKey: 'sk-test' } as const,
  model: 'test-model',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openaiCompatibleProvider', () => {
  it('POSTs OpenAI-shaped chat/completions with bearer auth and trailing slash trimmed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(openaiCompatibleProvider(baseConfig).complete({ prompt: 'hello' }))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://llm.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: 'test-model',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    })
  })

  it('supports custom-header and none auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      openaiCompatibleProvider({
        ...baseConfig,
        auth: { type: 'header', name: 'X-API-Key', value: 'abc' },
      }).complete({ prompt: 'x' }),
    )
    let headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('abc')
    expect(headers.Authorization).toBeUndefined()

    await collect(
      openaiCompatibleProvider({ ...baseConfig, auth: { type: 'none' } }).complete({ prompt: 'x' }),
    )
    headers = fetchMock.mock.calls[1][1].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('combines provider-level systemPrompt with the per-request system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: [DONE]\n\n']))
    vi.stubGlobal('fetch', fetchMock)

    await collect(
      openaiCompatibleProvider({ ...baseConfig, systemPrompt: 'Be terse.' }).complete({
        system: 'Rewrite well.',
        prompt: 'text',
      }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be terse.\n\nRewrite well.' })
  })

  it('parses SSE deltas across chunk boundaries and ends on [DONE]', async () => {
    const delta = (text: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
    // Split one SSE event across two network chunks (mid-JSON).
    const event = delta('world!')
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([delta('Hello, '), event.slice(0, 20), event.slice(20), 'data: [DONE]\n\n']),
    )
    vi.stubGlobal('fetch', fetchMock)

    const events = await collect(
      openaiCompatibleProvider(baseConfig).complete({ prompt: 'x' }),
    )
    expect(events).toEqual([
      { type: 'delta', text: 'Hello, ' },
      { type: 'delta', text: 'world!' },
      { type: 'done' },
    ])
  })

  it('yields an error event on non-OK responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const events = await collect(
      openaiCompatibleProvider(baseConfig).complete({ prompt: 'x' }),
    )
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect((events[0] as { error: Error }).error.message).toContain('401')
  })

  it('yields an error event when fetch rejects (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const events = await collect(
      openaiCompatibleProvider(baseConfig).complete({ prompt: 'x' }),
    )
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
    const iter = openaiCompatibleProvider(baseConfig).complete({
      prompt: 'x',
      signal: controller.signal,
    })
    const reading = (async () => {
      for await (const e of iter) events.push(e)
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
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'b' } }] })}\n\n`,
          'data: [DONE]\n\n',
        ]),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const iter = openaiCompatibleProvider(baseConfig)
      .complete({ prompt: 'x' })
      [Symbol.asyncIterator]()
    const first = await iter.next()
    expect(first.value).toEqual({ type: 'delta', text: 'a' })
    await iter.return?.(undefined) // consumer walks away mid-stream

    expect(fetchSignal?.aborted).toBe(true)
  })
})
