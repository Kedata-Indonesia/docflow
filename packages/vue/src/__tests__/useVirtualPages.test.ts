import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageOverlayConfig, PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'
import type { useVirtualPages } from '../composables/useVirtualPages.js'

const mocks = vi.hoisted(() => ({
  constructed: [] as PageOverlayConfig[],
  updateConfig: vi.fn(),
  resolvedWidths: [] as number[],
  disconnect: vi.fn(),
  instances: [] as Array<{ emit: (data: PageOverlayData) => void }>,
}))

vi.mock('@kedata-indonesia/docflow-layout-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kedata-indonesia/docflow-layout-engine')>()

  /** Mirror the real class: normalise a partial config into `PageOverlayData`. */
  const resolveConfig = (config: PageOverlayConfig): PageOverlayData['config'] => {
    const ps = typeof config.pageSize === 'string' ? actual.getPageSize(config.pageSize) : config.pageSize
    if (!ps) throw new Error(`Unknown page size: ${String(config.pageSize)}`)
    return {
      pageSize: ps,
      margins: config.margins ?? { top: 20, bottom: 20, left: 50, right: 50 },
      pageGap: config.pageGap ?? 40,
      headerLeft: config.headerLeft ?? '',
      headerRight: config.headerRight ?? '',
      footerLeft: config.footerLeft ?? '',
      footerRight: config.footerRight ?? '',
    }
  }

  class FakeOverlay {
    onVisibleChange?: (data: PageOverlayData) => void
    private config: PageOverlayData['config']

    constructor(_el: HTMLElement, config: PageOverlayConfig) {
      this.config = resolveConfig(config)
      mocks.constructed.push(config)
      mocks.instances.push(this)
    }

    emit(data: PageOverlayData): void {
      this.onVisibleChange?.(data)
    }

    observe(): void {}

    async layout(): Promise<PageOverlayData> {
      return { totalPages: 1, visiblePages: [], config: this.config }
    }

    async updateConfig(next: Partial<PageOverlayConfig>): Promise<PageOverlayData> {
      mocks.updateConfig(next)
      this.config = resolveConfig({ ...this.config, ...next })
      mocks.resolvedWidths.push(this.config.pageSize.pageWidth)
      return { totalPages: 1, visiblePages: [], config: this.config }
    }

    getData(): PageOverlayData {
      return { totalPages: 1, visiblePages: [], config: this.config }
    }

    disconnect(): void {
      mocks.disconnect()
    }
  }

  return { ...actual, VirtualPageOverlay: FakeOverlay }
})

const makeConfig = (pageWidth: number, pageHeight: number): PageOverlayConfig => ({
  pageSize: { id: 'a4', name: 'A4', pageWidth, pageHeight },
  margins: { top: 20, bottom: 20, left: 50, right: 50 },
  pageGap: 40,
  headerLeft: '',
  headerRight: '',
  footerLeft: '',
  footerRight: '',
})

/** One harness component for every case — keeps `vue/one-component-per-file` happy. */
function harness(setup: () => void) {
  return defineComponent({
    setup() {
      setup()
      return () => h('div')
    },
  })
}

describe('useVirtualPages', () => {
  beforeEach(() => {
    mocks.constructed.length = 0
    mocks.resolvedWidths.length = 0
    mocks.instances.length = 0
    mocks.updateConfig.mockClear()
    mocks.disconnect.mockClear()
  })

  it('pushes a live config ref into updateConfig()', async () => {
    const { useVirtualPages } = await import('../composables/useVirtualPages.js')

    const config = ref(makeConfig(794, 1123))
    const editorRef = ref({ view: { dom: document.createElement('div') } })
    const scrollRef = ref<HTMLElement | null>(document.createElement('div'))

    const TestComponent = harness(() => {
      useVirtualPages({ editorRef, scrollRef, config })
    })

    const wrapper = mount(TestComponent)
    try {
      await nextTick()
      expect(mocks.constructed).toHaveLength(1)
      expect(mocks.updateConfig).not.toHaveBeenCalled()

      // A new page size must reach the overlay instead of being ignored.
      config.value = makeConfig(816, 1204)
      await nextTick()
      expect(mocks.updateConfig).toHaveBeenCalledTimes(1)
      expect(mocks.resolvedWidths).toEqual([816])
    } finally {
      wrapper.unmount()
    }
  })

  it('does not start a polling timer (#376)', async () => {
    const { useVirtualPages: useVirtualPagesRuntime } = await import('../composables/useVirtualPages.js')
    const interval = vi.spyOn(globalThis, 'setInterval')

    const editorRef = ref({ view: { dom: document.createElement('div') } })
    const scrollRef = ref<HTMLElement | null>(document.createElement('div'))
    const TestComponent = harness(() => {
      useVirtualPagesRuntime({ editorRef, scrollRef, config: ref(makeConfig(794, 1123)) })
    })

    const wrapper = mount(TestComponent)
    try {
      await nextTick()
      expect(interval).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      interval.mockRestore()
    }
  })

  it('pushes visibility changes through onVisibleChange (#376)', async () => {
    const { useVirtualPages: useVirtualPagesRuntime } = await import('../composables/useVirtualPages.js')
    let api: ReturnType<typeof useVirtualPages> | undefined

    const editorRef = ref({ view: { dom: document.createElement('div') } })
    const scrollRef = ref<HTMLElement | null>(document.createElement('div'))
    const TestComponent = harness(() => {
      api = useVirtualPagesRuntime({ editorRef, scrollRef, config: ref(makeConfig(794, 1123)) })
    })

    const wrapper = mount(TestComponent)
    try {
      await nextTick()
      const next: PageOverlayData = {
        totalPages: 7,
        visiblePages: [{ index: 2, top: 2246, height: 50 }],
        config: api!.data.value.config,
      }
      mocks.instances[0].emit(next)
      await nextTick()
      expect(api!.totalPages.value).toBe(7)
      expect(api!.visiblePages.value).toEqual(next.visiblePages)
    } finally {
      wrapper.unmount()
    }
  })

  it('rebinds the overlay when the editor DOM changes (#373)', async () => {
    const { useVirtualPages: useVirtualPagesRuntime } = await import('../composables/useVirtualPages.js')
    const first = document.createElement('div')
    const second = document.createElement('div')
    const editorRef = ref<{ view: { dom: HTMLElement } } | null>({ view: { dom: first } })
    const scrollRef = ref<HTMLElement | null>(document.createElement('div'))
    const TestComponent = harness(() => {
      useVirtualPagesRuntime({ editorRef, scrollRef, config: ref(makeConfig(794, 1123)) })
    })

    const wrapper = mount(TestComponent)
    try {
      await nextTick()
      expect(mocks.constructed).toHaveLength(1)

      editorRef.value = { view: { dom: second } }
      await nextTick()
      await nextTick()

      expect(mocks.constructed).toHaveLength(2)
      expect(mocks.disconnect).toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })
})
