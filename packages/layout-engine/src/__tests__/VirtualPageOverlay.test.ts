import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageLayout } from '../PageLayout'
import { VirtualPageOverlay } from '../VirtualPageOverlay'

const size = (id: string, pageWidth: number, pageHeight: number) => ({
  id,
  name: id.toUpperCase(),
  pageWidth,
  pageHeight,
})

describe('VirtualPageOverlay.updateConfig', () => {
  const overlays: VirtualPageOverlay[] = []

  afterEach(() => {
    overlays.forEach((overlay) => overlay.disconnect())
    overlays.length = 0
    vi.restoreAllMocks()
  })

  it('rebuilds the PageLayout only when the page size or margins change', async () => {
    const destroy = vi.spyOn(PageLayout.prototype, 'destroy')
    const editorEl = document.createElement('div')
    const overlay = new VirtualPageOverlay(editorEl, { pageSize: size('a4', 794, 1123) }, document.createElement('div'))
    overlays.push(overlay)

    // Header/footer-only updates must not re-create the layout (R1).
    await overlay.updateConfig({ headerLeft: 'Header', footerRight: 'Page 1' })
    expect(destroy).not.toHaveBeenCalled()

    // A page size with identical geometry is not a change either.
    await overlay.updateConfig({ pageSize: size('a4', 794, 1123) })
    expect(destroy).not.toHaveBeenCalled()

    // Margins are baked into `PageLayout`, so they do require a rebuild.
    await overlay.updateConfig({ margins: { top: 10, bottom: 10, left: 10, right: 10 } })
    expect(destroy).toHaveBeenCalledTimes(1)

    await overlay.updateConfig({ pageSize: size('f4', 816, 1204) })
    expect(destroy).toHaveBeenCalledTimes(2)

    const data = await overlay.updateConfig({ pageSize: 'f4' })
    expect(data.config.pageSize.pageWidth).toBe(816)
    expect(data.config.margins).toEqual({ top: 10, bottom: 10, left: 10, right: 10 })
  })
})
