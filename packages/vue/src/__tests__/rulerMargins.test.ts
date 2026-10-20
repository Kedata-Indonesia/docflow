import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RulerBar from '../components/RulerBar.vue'

/**
 * Issue #295 — the ruler used to be decoration: two triangles with no handler. These
 * tests pin the contract the fix introduces: a drag (or an arrow key) on a marker
 * reports new page margins, scaled by the zoom factor, clamped to the page.
 */

const layoutOptions = {
  pageWidth: 794,
  pageHeight: 1123,
  margins: { top: 96, bottom: 96, left: 96, right: 96 },
}

function lastMargins(wrapper: ReturnType<typeof mount>) {
  const events = wrapper.emitted('update:margins') ?? []
  return events.at(-1)?.[0] as { top: number; bottom: number; left: number; right: number } | undefined
}

describe('draggable margin markers (#295)', () => {
  it('grows the left margin when the left marker is dragged right', async () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 100 } })
    const marker = wrapper.get('[data-testid="ruler-margin-left"]')

    await marker.trigger('pointerdown', { clientX: 100, pointerId: 1 })
    await marker.trigger('pointermove', { clientX: 140, pointerId: 1 })

    expect(lastMargins(wrapper)).toMatchObject({ left: 136, right: 96, top: 96, bottom: 96 })
    wrapper.unmount()
  })

  it('grows the right margin when the right marker is dragged left', async () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 100 } })
    const marker = wrapper.get('[data-testid="ruler-margin-right"]')

    await marker.trigger('pointerdown', { clientX: 700, pointerId: 1 })
    await marker.trigger('pointermove', { clientX: 660, pointerId: 1 })

    expect(lastMargins(wrapper)).toMatchObject({ right: 136, left: 96 })
    wrapper.unmount()
  })

  it('converts visual drag distance to layout px at 150 % zoom', async () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 150 } })
    const marker = wrapper.get('[data-testid="ruler-margin-left"]')

    // 60 visual px are 40 layout px once the paper is scaled by 1.5.
    await marker.trigger('pointerdown', { clientX: 200, pointerId: 1 })
    await marker.trigger('pointermove', { clientX: 260, pointerId: 1 })

    expect(lastMargins(wrapper)).toMatchObject({ left: 136 })
    wrapper.unmount()
  })

  it('clamps so the text column never collapses', async () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 100 } })
    const marker = wrapper.get('[data-testid="ruler-margin-left"]')

    await marker.trigger('pointerdown', { clientX: 100, pointerId: 1 })
    await marker.trigger('pointermove', { clientX: 2000, pointerId: 1 })

    // The Page Setup dialog's 5 cm cap (189px).
    expect(lastMargins(wrapper)?.left).toBe(189)
    wrapper.unmount()
  })

  it('moves the margin with the arrow keys for keyboard users', async () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 100 } })
    const marker = wrapper.get('[data-testid="ruler-margin-left"]')

    await marker.trigger('keydown', { key: 'ArrowRight' })
    expect(lastMargins(wrapper)).toMatchObject({ left: 104 })

    // Shift is a modifier flag, which Vue Test Utils' trigger does not always copy onto
    // the event — dispatch a real KeyboardEvent so the accelerated step is what is tested.
    marker.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    )
    await wrapper.vm.$nextTick()
    expect(lastMargins(wrapper)).toMatchObject({ left: 120 })

    wrapper.unmount()
  })

  it('does not emit while no marker is being dragged', async () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 100 } })
    await wrapper.get('[data-testid="ruler-margin-left"]').trigger('pointermove', { clientX: 400 })
    expect(wrapper.emitted('update:margins')).toBeUndefined()
    wrapper.unmount()
  })
})
