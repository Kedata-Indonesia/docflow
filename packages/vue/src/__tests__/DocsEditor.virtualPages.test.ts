import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageOverlayConfig, PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'
import DocsEditor from '../components/DocsEditor.vue'

const mocks = vi.hoisted(() => ({
  constructed: [] as PageOverlayConfig[],
  updateConfig: vi.fn(),
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
      return this.getData()
    }

    async updateConfig(next: Partial<PageOverlayConfig>): Promise<PageOverlayData> {
      mocks.updateConfig(next)
      this.config = resolveConfig({ ...this.config, ...next })
      return this.getData()
    }

    getData(): PageOverlayData {
      return { totalPages: 1, visiblePages: [], config: this.config }
    }

    disconnect(): void {}
  }

  return { ...actual, VirtualPageOverlay: FakeOverlay }
})

/** `init()` awaits `layout()` before flipping `isReady`, hence the second tick. */
const flush = async (): Promise<void> => {
  await nextTick()
  await nextTick()
}

describe('DocsEditor virtual page wiring', () => {
  beforeEach(() => {
    mocks.updateConfig.mockClear()
  })

  it('hands the live page size to VirtualPageOverlay.updateConfig()', async () => {
    const wrapper = mount(DocsEditor, { props: { pageSize: 'a4', virtualPages: true } })
    try {
      await flush()
      expect(mocks.constructed).toHaveLength(1)
      expect(mocks.updateConfig).not.toHaveBeenCalled()

      await wrapper.setProps({ pageSize: 'f4' })
      await flush()
      expect(mocks.updateConfig).toHaveBeenCalledTimes(1)

      const forwarded = mocks.updateConfig.mock.calls[0]?.[0]?.pageSize
      expect(typeof forwarded === 'object' ? forwarded?.pageWidth : undefined).toBe(816)
    } finally {
      wrapper.unmount()
    }
  })
})
