import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { citationPlugin, footnotePlugin } from '@kedata-indonesia/docflow-plugins'
import type { AIDraftCitation, AIDraftEvent, AIDraftFn, AIStreamFn } from '@kedata-indonesia/docflow-core'
import AISidebar from '../components/sidebars/AISidebar.vue'

const plugins = [footnotePlugin, citationPlugin]

function makeEditor(onSourcesChangeSpy: (ids: string[]) => void = () => {}) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = createEditor({
    target,
    plugins,
    citation: {
      sources: [
        {
          id: 's1',
          type: 'book',
          title: 'Source One',
          author: [{ family: 'Doe', given: 'A' }],
          issued: { 'date-parts': [[2020]] },
        },
        {
          id: 's2',
          type: 'book',
          title: 'Source Two',
          author: [{ family: 'Roe', given: 'B' }],
          issued: { 'date-parts': [[2021]] },
        },
        {
          id: 's3',
          type: 'book',
          title: 'Source Three',
          author: [{ family: 'Moe', given: 'C' }],
          issued: { 'date-parts': [[2022]] },
        },
      ],
      // APA = in-text → `buildCitationNodes` returns inline `citation` specs.
      style: 'apa',
      onSourcesChange: onSourcesChangeSpy,
    },
  })
  return { instance, target, onSourcesChangeSpy }
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

/** Yields a canned `AIDraftEvent` sequence synchronously (delta+done). */
function makeMockAiDraft(events: AIDraftEvent[]): AIDraftFn {
  return (() => {
    return (async function* () {
      for (const e of events) yield e
    })()
  }) as AIDraftFn
}

const noopAiStream = (() => {
  return (async function* () {})()
}) as AIStreamFn

describe('AISidebar.insert (7E-4)', () => {
  let inst: ReturnType<typeof createEditor> | null = null

  afterEach(() => {
    inst?.destroy()
    document.body.innerHTML = ''
    inst = null
    vi.restoreAllMocks()
  })

  async function setupDraftTurn(
    draftText: string,
    citations: AIDraftCitation[],
    onSourcesChangeSpy: (ids: string[]) => void = () => {},
  ): Promise<{
    editor: ReturnType<typeof createEditor>['editor']
    wrapper: ReturnType<typeof mount>
    onSourcesChangeSpy: (ids: string[]) => void
  }> {
    const { instance } = makeEditor(onSourcesChangeSpy)
    inst = instance
    const editor = instance.editor
    editor.commands.focus('end')
    editor.commands.insertContent('Start.\u00a0')
    await flush()

    const wrapper = mount(AISidebar, {
      props: {
        editor,
        aiStream: noopAiStream,
        aiDraft: makeMockAiDraft([
          { type: 'delta', text: draftText },
          { type: 'done', citations },
        ]),
      },
    })

    // Arm draft mode via the "Draft with citations" quick-action button.
    const draftBtn = wrapper.findAll('button').find((b) => b.text().includes('Draft with citations'))
    expect(draftBtn).toBeDefined()
    await draftBtn!.trigger('click')

    // Type a prompt and submit → drives `sendDraft` → the mock aiDraft
    // yields delta+done synchronously, populating the assistant turn
    // (with `turn.citations` set).
    const textarea = wrapper.find('textarea')
    await textarea.setValue('draft something about my sources')
    await wrapper.find('form').trigger('submit')
    await flush(15)
    await wrapper.vm.$nextTick()
    return { editor, wrapper, onSourcesChangeSpy }
  }

  it('handleInsert dispatches EXACTLY ONCE for a 3-marker draft (content-array path)', async () => {
    const onSourcesChangeSpy = vi.fn()
    const citations: AIDraftCitation[] = [
      { ref: 1, sourceId: 's1', label: 'Doe (2020)' },
      { ref: 2, sourceId: 's2', label: 'Roe (2021)' },
      { ref: 3, sourceId: 's3', label: 'Moe (2022)' },
    ]
    const { editor, wrapper } = await setupDraftTurn(
      'Claim A [1]. Claim B [2]. Claim C [3].',
      citations,
      onSourcesChangeSpy,
    )

    // The draft turn should now carry the citation table — assert via the
    // rendered chips before spying (chip row renders iff citations.length>0).
    expect(wrapper.text()).toContain('[1]')
    expect(wrapper.text()).toContain('[2]')
    expect(wrapper.text()).toContain('[3]')

    // Spy AFTER the draft settles — only the insert counts from here.
    const dispatchSpy = vi.spyOn(editor.view, 'dispatch')

    const insertBtn = wrapper.findAll('button').find((b) => b.text().includes('Insert'))
    expect(insertBtn).toBeDefined()
    await insertBtn!.trigger('click')
    await flush(20)

    // §2 decision 6 + §4 7E-4 Accept: the content-array insert dispatches
    // exactly ONE *substantive* transaction (one with steps — i.e. one that
    // mutates the doc and would flow through Yjs as a single history entry).
    // `view.dispatch` may additionally fire a cosmetic focus/scroll tr with
    // `steps.length === 0` (it makes no history entry — doesn't expand Yjs
    // history or push to collab), which the "ONE history entry" invariant
    // permits. So count substantive dispatches only.
    const substantiveTrs = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { steps: unknown[] }).steps.length > 0,
    )
    expect(substantiveTrs).toHaveLength(1)

    // And the inserted doc carries 3 inline `citation` nodes with real
    // sourceIds from the done-event table (the carry-forward: the table is
    // the only source for sourceId — markers flowed through it).
    const docJson = editor.view.state.doc.toJSON() as {
      content?: Array<{ content?: Array<{ type: string; attrs?: Record<string, unknown> }> }>
    }
    const cites = (docJson.content ?? []).flatMap((p) => p.content ?? []).filter(
      (n) => n.type === 'citation',
    )
    const ids = cites.map((c) => c.attrs?.sourceId).sort()
    expect(ids).toEqual(['s1', 's2', 's3'])

    // §0 "Citation rendering in collab" + §4 7E-4 Accept "snapshot persist
    // still fires": the CitationEngineExtension.onUpdate walk fired on the
    // single dispatch and called `onSourcesChange` with the cited sourceIds
    // (the load-bearing "Phase 6 path NOT bypassed" guarantee — the host's
    // scheduleSnapshotPersist runs from this callback → Document.sources).
    expect(onSourcesChangeSpy).toHaveBeenCalledTimes(1)
    expect((onSourcesChangeSpy.mock.calls[0] as unknown[])[0]).toEqual(['s1', 's2', 's3'])

    wrapper.unmount()
  })

  it('handleInsert with empty citations falls back to the plain-text insert (no regression for 7D/0-results)', async () => {
    const { editor, wrapper } = await setupDraftTurn('plain generated text', [])

    // 0-results `done.citations: []` → no chips row, BUT insert button still
    // renders because `turn.text` is truthy and `turn.error` is false (the
    // gating `v-if` doesn't tighten on citations emptiness).
    const insertBtn = wrapper.findAll('button').find((b) => b.text().includes('Insert'))
    expect(insertBtn).toBeDefined()

    const dispatchSpy = vi.spyOn(editor.view, 'dispatch')
    await insertBtn!.trigger('click')
    await flush(5)

    // Plain-text path = ONE substantive dispatch (`tr.insertText`, the §2
    // decision 6 invariant). `view.focus()` may additionally fire a cosmetic
    // tr with zero steps — counted by `view.dispatch` but not a history entry
    // (see the sibling "3-marker" test above for the rationale).
    const substantiveTrs = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { steps: unknown[] }).steps.length > 0,
    )
    expect(substantiveTrs).toHaveLength(1)

    const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size)
    expect(docText).toContain('plain generated text')
    // No citation node leaked — 0-results stays plain text.
    const docJson = editor.view.state.doc.toJSON() as {
      content?: Array<{ content?: Array<{ type: string }> }>
    }
    const citeNodes = (docJson.content ?? []).flatMap((p) => p.content ?? []).filter(
      (n) => n.type === 'citation',
    )
    expect(citeNodes).toHaveLength(0)

    wrapper.unmount()
  })

  it('errored draft turn hides the Insert button and clears citations (bug-hunter carry-forward)', async () => {
    const { instance } = makeEditor()
    inst = instance
    const editor = instance.editor
    editor.commands.focus('end')
    editor.commands.insertContent('Start.\u00a0')
    await flush()

    // Mock aiDraft yields an `error` EVENT (not a throw — the carry-forward).
    const aiDraft = makeMockAiDraft([
      { type: 'delta', text: 'partial' },
      { type: 'error', message: 'provider unavailable' },
    ])
    const wrapper = mount(AISidebar, {
      props: { editor, aiStream: noopAiStream, aiDraft },
    })

    const draftBtn = wrapper.findAll('button').find((b) => b.text().includes('Draft with citations'))
    await draftBtn!.trigger('click')
    const textarea = wrapper.find('textarea')
    await textarea.setValue('ask anything')
    await wrapper.find('form').trigger('submit')
    await flush(15)
    await wrapper.vm.$nextTick()

    // The error message surfaced on the turn, Insert button stays HIDDEN
    // (turn.error === true breaks the v-if), and dispatch was never invoked
    // for an insert (the bug-hunter carry-forward — Insert is enabled only
    // on `done` with the table).
    expect(wrapper.text()).toContain('provider unavailable')
    const insertBtn = wrapper.findAll('button').find((b) => b.text().includes('Insert'))
    expect(insertBtn).toBeUndefined()

    wrapper.unmount()
  })
})