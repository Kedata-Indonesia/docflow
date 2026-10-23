import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MODEL_UPDATE_DEBOUNCE_MS,
  useDocumentModel,
} from '../composables/useDocumentModel.js'

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

type Model = ReturnType<typeof useDocumentModel>

const Harness = defineComponent({
  setup(_, { expose }) {
    const emitted: object[] = []
    const model = useDocumentModel({
      modelValue: doc('Initial'),
      getPlugins: () => [],
      emit: (_event, value) => { emitted.push(value) },
      getHeaderFooter: () => ({
        headerLeft: 'L',
        headerRight: 'R',
        footerLeft: '',
        footerRight: '',
      }),
      getEditor: () => null,
    })
    expose({ emitted, model })
    return () => h('div')
  },
})

interface HarnessVm {
  emitted: object[]
  model: Model
}

const mountHarness = (): { wrapper: ReturnType<typeof mount>; vm: HarnessVm } => {
  const wrapper = mount(Harness)
  return { wrapper, vm: wrapper.vm as unknown as HarnessVm }
}

const typedContent = (emitted: object | undefined, index = 0): string => {
  const tabs = (emitted as { tabs?: Array<{ content?: unknown }> } | undefined)?.tabs
  return JSON.stringify(tabs?.[index]?.content ?? '')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useDocumentModel emit debounce (#374)', () => {
  it('coalesces scheduled persists and flips saving → saved', () => {
    vi.useFakeTimers()
    const { wrapper, vm } = mountHarness()

    vm.model.tabContents.value['tab-1'] = doc('typed')
    vm.model.schedulePersistCurrentDoc()
    expect(vm.model.savingStatus.value).toBe('saving')
    expect(vm.emitted).toHaveLength(0)

    vi.advanceTimersByTime(MODEL_UPDATE_DEBOUNCE_MS - 1)
    expect(vm.emitted).toHaveLength(0)

    vi.advanceTimersByTime(1)
    expect(vm.emitted).toHaveLength(1)
    expect(typedContent(vm.emitted[0])).toContain('typed')
    expect(vm.model.savingStatus.value).toBe('saving')

    vi.advanceTimersByTime(800)
    expect(vm.model.savingStatus.value).toBe('saved')
    wrapper.unmount()
  })

  it('stays saving when a burst outlasts the previous saved timer', () => {
    vi.useFakeTimers()
    const { wrapper, vm } = mountHarness()

    vm.model.schedulePersistCurrentDoc()
    vi.advanceTimersByTime(MODEL_UPDATE_DEBOUNCE_MS)
    expect(vm.emitted).toHaveLength(1)

    // Keep typing faster than the debounce for longer than the 800 ms saved
    // timer started by the first emit.
    for (let index = 0; index < 8; index += 1) {
      vm.model.tabContents.value['tab-1'] = doc(`typed-${index}`)
      vm.model.schedulePersistCurrentDoc()
      vi.advanceTimersByTime(100)
    }

    expect(vm.model.savingStatus.value).toBe('saving')
    vi.advanceTimersByTime(MODEL_UPDATE_DEBOUNCE_MS)
    expect(vm.emitted).toHaveLength(2)

    vi.advanceTimersByTime(800)
    expect(vm.model.savingStatus.value).toBe('saved')
    wrapper.unmount()
  })

  it('drops the queued emit when the host writes modelValue', () => {
    vi.useFakeTimers()
    const { wrapper, vm } = mountHarness()

    vm.model.schedulePersistCurrentDoc()
    vi.advanceTimersByTime(MODEL_UPDATE_DEBOUNCE_MS)
    expect(vm.emitted).toHaveLength(1)

    vm.model.tabContents.value['tab-1'] = doc('unsaved')
    vm.model.schedulePersistCurrentDoc()
    expect(vm.model.savingStatus.value).toBe('saving')

    vm.model.applyModelValue(doc('from-host'))
    expect(vm.model.savingStatus.value).toBe('saved')
    expect(JSON.stringify(vm.model.activeTabContent.value)).toContain('from-host')

    vi.advanceTimersByTime(1000)
    expect(vm.emitted).toHaveLength(1)
    wrapper.unmount()
  })
})
