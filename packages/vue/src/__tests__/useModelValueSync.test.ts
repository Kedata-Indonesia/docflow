import { effectScope, nextTick, ref, type Ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useModelValueSync } from '../composables/useModelValueSync.js'

const docA = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }
const docB = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] }

interface FakeEditor {
  commands: { setContent: ReturnType<typeof vi.fn> }
  getJSON: () => object
}

function fakeEditor(json: object): FakeEditor {
  return { commands: { setContent: vi.fn() }, getJSON: () => json }
}

function runSync(
  source: Ref<object | string | undefined>,
  overrides: Partial<Parameters<typeof useModelValueSync>[0]> & { editor?: FakeEditor | null } = {},
) {
  const { editor = fakeEditor(docA), ...rest } = overrides
  const applyHeaderFooter = vi.fn()
  const onApplied = vi.fn()
  const applyModelValue = vi.fn((value: unknown) => ({ content: value as object }))
  const getLastEmitted = vi.fn(() => null as object | null)
  const isCollaborative = vi.fn(() => false)

  const scope = effectScope()
  scope.run(() => {
    useModelValueSync({
      getModelValue: () => source.value,
      getEditor: () => editor as never,
      isCollaborative,
      getLastEmitted,
      applyModelValue,
      applyHeaderFooter,
      onApplied,
      ...rest,
    })
  })

  return { editor: editor as FakeEditor, applyModelValue, applyHeaderFooter, onApplied, getLastEmitted, isCollaborative, scope }
}

describe('useModelValueSync', () => {
  it('applies a host write without echoing it back', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source)

    source.value = docB
    await nextTick()

    expect(sync.applyModelValue).toHaveBeenCalledWith(docB)
    expect(sync.editor.commands.setContent).toHaveBeenCalledWith(docB, { emitUpdate: false })
    expect(sync.onApplied).toHaveBeenCalledOnce()
    sync.scope.stop()
  })

  it('ignores a v-model echo of the last emitted document', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source)
    sync.getLastEmitted.mockReturnValue(docB)

    // A host may store and return a clone rather than the same reference.
    source.value = JSON.parse(JSON.stringify(docB)) as object
    await nextTick()

    expect(sync.applyModelValue).not.toHaveBeenCalled()
    expect(sync.editor.commands.setContent).not.toHaveBeenCalled()
    sync.scope.stop()
  })

  it('applies header/footer slots carried by a tabbed document', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source, {
      applyModelValue: vi.fn(() => ({
        content: docB,
        headerFooter: { headerLeft: 'H', headerRight: '', footerLeft: '', footerRight: 'F' },
      })),
    })

    source.value = { type: 'tabbed-doc', activeTabId: 'tab-1', tabs: [] }
    await nextTick()

    expect(sync.applyHeaderFooter).toHaveBeenCalledWith({
      headerLeft: 'H', headerRight: '', footerLeft: '', footerRight: 'F',
    })
    sync.scope.stop()
  })

  it('skips collaboration mode entirely', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source, { isCollaborative: () => true })

    source.value = docB
    await nextTick()

    expect(sync.applyModelValue).not.toHaveBeenCalled()
    expect(sync.editor.commands.setContent).not.toHaveBeenCalled()
    sync.scope.stop()
  })

  it('does not replace content the editor already shows', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source, { editor: fakeEditor(docB) })

    source.value = docB
    await nextTick()

    expect(sync.applyModelValue).toHaveBeenCalled()
    expect(sync.editor.commands.setContent).not.toHaveBeenCalled()
    sync.scope.stop()
  })

  it('updates the model even when the editor has not mounted yet', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source, { editor: null })

    source.value = docB
    await nextTick()

    expect(sync.applyModelValue).toHaveBeenCalledWith(docB)
    expect(sync.onApplied).not.toHaveBeenCalled()
    sync.scope.stop()
  })

  it('ignores undefined and null writes', async () => {
    const source = ref<object | string | undefined>(docA)
    const sync = runSync(source)

    source.value = undefined
    await nextTick()
    source.value = null as unknown as undefined
    await nextTick()

    expect(sync.applyModelValue).not.toHaveBeenCalled()
    sync.scope.stop()
  })
})
