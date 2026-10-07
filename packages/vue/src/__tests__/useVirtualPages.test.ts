import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { PageOverlayConfig, PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'

const mocks = vi.hoisted(() => ({
  constructed: [] as PageOverlayConfig[],
  updateConfig: vi.fn(),
  resolvedWidths: [] as number[],
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
    private config: PageOverlayData['config']

    constructor(_el: HTMLElement, config: PageOverlayConfig) {
      this.config = resolveConfig(config)
      mocks.constructed.push(config)
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

    disconnect(): void {}
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

describe('useVirtualPages', () => {
  it('pushes a live config ref into updateConfig()', async () => {
    const { useVirtualPages } = await import('../composables/useVirtualPages.js')

    const config = ref(makeConfig(794, 1123))
    const editorRef = ref({ view: { dom: document.createElement('div') } })
    const scrollRef = ref<HTMLElement | null>(document.createElement('div'))

    const TestComponent = defineComponent({
      setup() {
        useVirtualPages({ editorRef, scrollRef, config })
        return () => h('div')
      },
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
})
