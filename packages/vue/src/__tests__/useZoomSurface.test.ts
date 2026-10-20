import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { useZoomSurface } from '../composables/useZoomSurface.js'

function makeHarness() {
  let measureFn: (() => void) | null = null
  const Harness = defineComponent({
    props: { scale: { type: Number, required: true } },
    setup(props) {
      const api = useZoomSurface(computed(() => props.scale))
      measureFn = api.measure
      return () =>
        h('div', { class: 'outer', style: api.outerStyle.value }, [
          h('div', {
            class: 'inner',
            ref: (el: unknown) => {
              api.surfaceRef.value = el as HTMLElement | null
            },
            style: api.innerStyle.value,
          }),
        ])
    },
  })
  return { Harness, measure: () => measureFn?.() }
}

describe('useZoomSurface (#144)', () => {
  it('reserves the scaled box while keeping the inner layout unscaled', async () => {
    const { Harness, measure } = makeHarness()
    const wrapper = mount(Harness, { props: { scale: 1 } })

    // Before the first measurement the outer still spans the column.
    expect(wrapper.get('.outer').attributes('style')).toContain('width: 100%')

    const inner = wrapper.get('.inner').element as HTMLElement
    Object.defineProperty(inner, 'offsetWidth', { configurable: true, get: () => 794 })
    Object.defineProperty(inner, 'offsetHeight', { configurable: true, get: () => 1123 })
    measure()
    await nextTick()

    const outerStyle = wrapper.get('.outer').attributes('style')
    expect(outerStyle).toContain('width: 794px')
    expect(outerStyle).toContain('height: 1123px')
    expect(outerStyle).toContain('flex-shrink: 0')
    expect(wrapper.get('.inner').attributes('style')).toContain('transform: scale(1)')
    expect(wrapper.get('.inner').attributes('style')).toContain('--docflow-zoom: 1')

    await wrapper.setProps({ scale: 1.5 })
    await nextTick()
    const zoomed = wrapper.get('.outer').attributes('style')
    expect(zoomed).toContain('width: 1191px')
    expect(zoomed).toContain('height: 1684.5px')
    expect(wrapper.get('.inner').attributes('style')).toContain('transform: scale(1.5)')
    expect(wrapper.get('.inner').attributes('style')).toContain('--docflow-zoom: 1.5')

    wrapper.unmount()
  })
})
