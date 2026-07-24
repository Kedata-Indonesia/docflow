import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import type { AIStreamFn } from '@kedata-indonesia/docflow-core'
import { aiPlugin, getAIPreview, aiPluginKey } from '../index.js'

/** Controlled fake stream — tests push chunks, then finish or fail. */
function makeFakeStream(): {
  aiStream: AIStreamFn
  push: (chunk: string) => void
  finish: () => void
  fail: (err: Error) => void
  calls: number
} {
  let calls = 0
  const state = {
    calls: 0,
    push: (_chunk: string) => {},
    finish: () => {},
    fail: (_err: Error) => {},
    aiStream: undefined as unknown as AIStreamFn,
  }
  state.aiStream = (() => {
    calls++
    state.calls = calls
    const queue: Array<{ type: 'chunk'; text: string } | { type: 'end' } | { type: 'error'; err: Error }> = []
    let notify: (() => void) | null = null
    state.push = (chunk: string) => {
      queue.push({ type: 'chunk', text: chunk })
      notify?.()
    }
    state.finish = () => {
      queue.push({ type: 'end' })
      notify?.()
    }
    state.fail = (err: Error) => {
      queue.push({ type: 'error', err })
      notify?.()
    }
    return (async function* () {
      for (;;) {
        while (queue.length > 0) {
          const item = queue.shift()!
          if (item.type === 'chunk') { yield item.text; continue }
          if (item.type === 'error') throw item.err
          return
        }
        await new Promise<void>((resolve) => { notify = resolve })
        notify = null
      }
    })()
  }) as AIStreamFn
  return state
}

/** Flush pending microtasks so the async streaming loop can progress. */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

/**
 * Counts doc-changing transactions — the collab-safety probe. Streaming must
 * produce ZERO of these (meta-only decorations); accept must produce ONE.
 */
function countDocChanges(editor: ReturnType<typeof createEditor>['editor']) {
  let count = 0
  const handler = ({ transaction }: { transaction: { docChanged: boolean } }) => {
    if (transaction.docChanged) count++
  }
  editor.on('transaction', handler)
  return {
    get count() { return count },
    stop() { editor.off('transaction', handler) },
  }
}

describe('aiPlugin (Phase 7B)', () => {
  let editorInstance: ReturnType<typeof createEditor>

  afterEach(() => {
    editorInstance?.destroy()
    editorInstance?.editor.view.dom.parentElement?.remove()
  })

  function setup(aiStream?: AIStreamFn) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editorInstance = createEditor({ target, plugins: [aiPlugin], aiStream })
    const { editor } = editorInstance
    editor.commands.insertContent('Hello world')
    // Select "world"
    editor.commands.setTextSelection({ from: 7, to: 12 })
    return editor
  }

  it('is inert without an injected aiStream port', () => {
    const editor = setup()
    const result = editor.commands.aiTransform({ action: 'rewrite' })
    expect(result).toBe(false)
    expect(getAIPreview(editor)).toBeNull()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world')
  })

  it('streams chunks into preview state without mutating the document', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    const probe = countDocChanges(editor)
    expect(editor.commands.aiTransform({ action: 'rewrite' })).toBe(true)
    expect(fake.calls).toBe(1)

    fake.push('Beautiful ')
    await flush()
    fake.push('world')
    await flush()

    const preview = getAIPreview(editor)
    expect(preview?.status).toBe('streaming')
    expect(preview?.text).toBe('Beautiful world')
    // The document itself is untouched while streaming (collab safety):
    // zero doc-changing transactions → zero Yjs churn.
    expect(probe.count).toBe(0)
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world')
    probe.stop()
  })

  it('accept replaces the selection in a single transaction', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.aiTransform({ action: 'rewrite' })
    fake.push('beautiful world')
    await flush()
    fake.finish()
    await flush()

    expect(getAIPreview(editor)?.status).toBe('done')

    const probe = countDocChanges(editor)
    expect(editor.commands.aiAccept()).toBe(true)
    // THE accept: exactly one doc-changing transaction (flows through Yjs
    // like a human edit; a collaborator sees one replace, not token churn).
    expect(probe.count).toBe(1)
    probe.stop()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello beautiful world')
    expect(getAIPreview(editor)).toBeNull()
    // The streamed chunks were meta-only → the only undoable step is the accept.
    editor.commands.undo()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).not.toContain('beautiful world')
  })

  it('reject discards the preview and leaves the document unchanged', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    const probe = countDocChanges(editor)
    editor.commands.aiTransform({ action: 'shorten' })
    fake.push('short')
    await flush()

    expect(editor.commands.aiReject()).toBe(true)
    expect(probe.count).toBe(0)
    probe.stop()
    expect(getAIPreview(editor)).toBeNull()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world')
  })

  it('surfaces stream errors in the preview state', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.aiTransform({ action: 'rewrite' })
    fake.fail(new Error('provider unavailable'))
    await flush()

    const preview = getAIPreview(editor)
    expect(preview?.status).toBe('error')
    expect(preview?.error).toBe('provider unavailable')
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world')

    expect(editor.commands.aiReject()).toBe(true)
    expect(getAIPreview(editor)).toBeNull()
  })

  it('refuses to start a second transform while a preview is active', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    expect(editor.commands.aiTransform({ action: 'rewrite' })).toBe(true)
    expect(editor.commands.aiTransform({ action: 'expand' })).toBe(false)
    expect(fake.calls).toBe(1)
  })

  it('cancels the preview when the text under it changes mid-stream', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.aiTransform({ action: 'rewrite' })
    fake.push('new ')
    await flush()
    expect(getAIPreview(editor)).not.toBeNull()

    // Simulate a collaborator typing inside the selected range.
    editor.commands.insertContentAt(8, 'X')
    expect(aiPluginKey.getState(editor.state)).toBeNull()
  })

  it('maps the preview range when text is inserted before it', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.aiTransform({ action: 'rewrite' })
    fake.push('world!')
    await flush()

    // Insert before the range — preview survives with shifted positions.
    editor.commands.insertContentAt(1, 'Say: ')
    const preview = aiPluginKey.getState(editor.state)
    expect(preview).not.toBeNull()
    expect(editor.state.doc.textBetween(preview!.from, preview!.to)).toBe('world')

    fake.finish()
    await flush()
    editor.commands.aiAccept()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Say: Hello world!')
  })

  // ─── /ai generate at cursor (7C) ──────────────────────────────────────────

  it('aiGenerate opens prompt mode without touching the document', () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    // Collapse the cursor at the end of "Hello world" (pos 12).
    editor.commands.setTextSelection(12)
    expect(editor.commands.aiGenerate()).toBe(true)

    const preview = getAIPreview(editor)
    expect(preview?.mode).toBe('generate')
    expect(preview?.status).toBe('prompt')
    expect(preview?.from).toBe(12)
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world')
    expect(fake.calls).toBe(0) // no request until the instruction is submitted
  })

  it('aiPromptSubmit streams ghost text and accept inserts it at the cursor in one transaction', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.setTextSelection(12)
    editor.commands.aiGenerate()
    expect(editor.commands.aiPromptSubmit({ prompt: 'write a greeting' })).toBe(true)
    expect(fake.calls).toBe(1)

    const probe = countDocChanges(editor)
    fake.push(' — selamat ')
    await flush()
    fake.push('pagi')
    await flush()

    const preview = getAIPreview(editor)
    expect(preview?.status).toBe('streaming')
    expect(preview?.text).toBe(' — selamat pagi')
    expect(probe.count).toBe(0) // still decoration-only
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world')

    fake.finish()
    await flush()
    expect(getAIPreview(editor)?.status).toBe('done')

    expect(editor.commands.aiAccept()).toBe(true)
    expect(probe.count).toBe(1) // exactly one doc-changing transaction
    probe.stop()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world — selamat pagi')
    expect(getAIPreview(editor)).toBeNull()
  })

  it('reject during prompt mode cancels without any request', () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.setTextSelection(12)
    editor.commands.aiGenerate()
    expect(editor.commands.aiReject()).toBe(true)
    expect(getAIPreview(editor)).toBeNull()
    expect(fake.calls).toBe(0)
  })

  it('moving the selection cancels prompt mode', () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.setTextSelection(12)
    editor.commands.aiGenerate()
    expect(getAIPreview(editor)?.status).toBe('prompt')

    editor.commands.setTextSelection(1)
    expect(getAIPreview(editor)).toBeNull()
  })

  it('generate is inert without an injected aiStream port', () => {
    const editor = setup()
    editor.commands.setTextSelection(12)
    expect(editor.commands.aiGenerate()).toBe(false)
    expect(getAIPreview(editor)).toBeNull()
  })

  it('generate never replaces a non-empty selection', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    // "world" is selected (setup) — /ai collapses to the cursor, accept must
    // INSERT at position 12, not replace the selection.
    editor.commands.aiGenerate()
    editor.commands.aiPromptSubmit({ prompt: 'add something' })
    fake.push('!')
    await flush()
    fake.finish()
    await flush()
    editor.commands.aiAccept()
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe('Hello world!')
  })

  it('ghost widget re-renders as chunks stream (PM same-key widget regression)', async () => {
    const fake = makeFakeStream()
    const editor = setup(fake.aiStream)

    editor.commands.setTextSelection(12)
    editor.commands.aiGenerate()
    editor.commands.aiPromptSubmit({ prompt: 'x' })
    await flush()

    const ghostText = () => editor.view.dom.querySelector('.docs-ai-ghost')?.textContent ?? ''
    // First paint: placeholder while no tokens yet.
    expect(ghostText()).toContain('AI writing…')

    fake.push(' flowing text')
    await flush()
    // Regression: a constant Decoration.widget key makes prosemirror-view
    // skip the redraw (WidgetType.eq) — the ghost froze at "AI writing…".
    expect(ghostText()).toContain('flowing text')

    fake.finish()
    await flush()
    expect(ghostText()).toContain('flowing text')
    expect(ghostText()).toContain('Accept')
  })
})
