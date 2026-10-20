import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RulerBar from '../components/RulerBar.vue'
import VerticalRuler from '../components/VerticalRuler.vue'

const layoutOptions = {
  pageWidth: 794,
  pageHeight: 1123,
  margins: { top: 96, bottom: 96, left: 96, right: 96 },
}

describe('rulers at zoom (#144)', () => {
  it('scales the horizontal page track, margins and ticks', () => {
    const wrapper = mount(RulerBar, { props: { layoutOptions, zoom: 150 } })
    const track = wrapper.get('.docs-editor-ruler > div')
    expect(track.attributes('style')).toContain('width: 1191px')
    // Centred before the measured track arrives.
    expect(track.attributes('style')).toContain('translateX(-50%)')

    const markers = wrapper.findAll('.border-t-blue-400')
    expect(markers).toHaveLength(2)
    expect(markers[0].attributes('style')).toContain('left: 144px')
    expect(markers[1].attributes('style')).toContain('left: 1047px')

    // Tick spacing is 48px × 1.5; labels are emitted every 96px (every 2 ticks).
    const labels = wrapper.findAll('.docs-editor-ruler span')
    expect(labels.length).toBeGreaterThan(0)
    expect(labels[0].text()).toBe('1')
    wrapper.unmount()
  })

  it('follows the measured paper box when supplied', () => {
    const wrapper = mount(RulerBar, {
      props: { layoutOptions, zoom: 200, pageLeftPx: 40, pageWidthPx: 1000 },
    })
    const track = wrapper.get('.docs-editor-ruler > div')
    expect(track.attributes('style')).toContain('width: 1000px')
    expect(track.attributes('style')).toContain('left: 40px')
    expect(track.attributes('style')).toContain('transform: none')
    wrapper.unmount()
  })

  it('scales the vertical ruler height and ticks', () => {
    const wrapper = mount(VerticalRuler, { props: { layoutOptions, zoom: 150 } })
    const root = wrapper.get('.docs-editor-vertical-ruler')
    expect(root.attributes('style')).toContain('min-height: 1684.5px')
    wrapper.unmount()
  })
})
