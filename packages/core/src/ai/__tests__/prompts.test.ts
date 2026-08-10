import { describe, expect, it } from 'vitest'
import { toAIStreamFn } from '../adapter.js'
import type { AICompleteRequest, AIProvider, StreamEvent } from '../provider.js'
import { buildAIPrompt, CONTEXT_CHAR_CAP } from '../prompts.js'

describe('buildAIPrompt', () => {
  it('quotes the selection for inline transforms', () => {
    const { system, prompt } = buildAIPrompt({ action: 'rewrite', selection: 'hello world' })
    expect(system).toContain('Rewrite the selected text')
    expect(prompt).toBe('Selected text:\n"""hello world"""')
  })

  it('carries the instruction for tone/translate/generate', () => {
    expect(buildAIPrompt({ action: 'tone', selection: 'x', prompt: 'casual' }).prompt).toContain(
      'Target tone: casual',
    )
    expect(
      buildAIPrompt({ action: 'translate', selection: 'x', prompt: 'Indonesian' }).prompt,
    ).toContain('Target language: Indonesian')
    expect(buildAIPrompt({ action: 'generate', prompt: 'write an intro' }).prompt).toContain(
      'Instruction: write an intro',
    )
  })

  it('bounds surrounding context to CONTEXT_CHAR_CAP per side', () => {
    const big = 'a'.repeat(CONTEXT_CHAR_CAP + 100)
    const { prompt } = buildAIPrompt({
      action: 'chat',
      prompt: 'question?',
      context: { before: big, after: big },
    })
    expect(prompt).toContain('Text before:\n"""…' + 'a'.repeat(CONTEXT_CHAR_CAP))
    expect(prompt).toContain('a'.repeat(CONTEXT_CHAR_CAP) + '…"""')
  })

  it('rejects the draft action (owned by the aiDraft port)', () => {
    expect(() => buildAIPrompt({ action: 'draft', prompt: 'x' })).toThrow(/aiDraft/)
  })
})

describe('toAIStreamFn', () => {
  function stubProvider(events: StreamEvent[], capture?: (req: AICompleteRequest) => void): AIProvider {
    return {
      async *complete(req: AICompleteRequest) {
        capture?.(req)
        yield* events
      },
    }
  }

  it('flattens deltas to text and ends on done', async () => {
    const fn = toAIStreamFn(
      stubProvider([
        { type: 'delta', text: 'a' },
        { type: 'delta', text: 'b' },
        { type: 'done' },
      ]),
    )
    const chunks: string[] = []
    for await (const chunk of fn({ action: 'rewrite', selection: 'x' }, new AbortController().signal)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['a', 'b'])
  })

  it('throws on an error event', async () => {
    const fn = toAIStreamFn(stubProvider([{ type: 'error', error: new Error('boom') }]))
    await expect(async () => {
      for await (const _ of fn({ action: 'rewrite', selection: 'x' }, new AbortController().signal)) {
        // consume
      }
    }).rejects.toThrow('boom')
  })

  it('passes the assembled system prompt and the caller signal to the provider', async () => {
    let seen: AICompleteRequest | undefined
    const fn = toAIStreamFn(stubProvider([{ type: 'done' }], (req) => (seen = req)))
    const signal = new AbortController().signal
    for await (const _ of fn({ action: 'summarize', selection: 'text' }, signal)) {
      // consume
    }
    expect(seen?.system).toContain('Summarize')
    expect(seen?.prompt).toContain('"""text"""')
    expect(seen?.signal).toBe(signal)
  })
})
