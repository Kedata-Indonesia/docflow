import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useRulerSync } from '../composables/useRulerSync.js'

function rect(left: number, width: number, height = 24): DOMRect {
  return {
    x: left,
    y: 0,
    top: 0,
    left,
    right: left + width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

describe('useRulerSync (#144)', () => {
  it('measures the paper against the ruler', () => {
    const ruler = document.createElement('div')
    const paper = document.createElement('div')
    const scroll = document.createElement('div')
    ruler.getBoundingClientRect = () => rect(100, 500)
    paper.getBoundingClientRect = () => rect(140, 300)
    document.body.append(ruler, paper, scroll)

    let measure!: () => void
    let pageLeft!: { value: number | null }
    let pageWidth!: { value: number | null }
    const Harness = defineComponent({
      setup() {
        const source = ref<unknown>(1)
        const api = useRulerSync({
          rulerRef: ref<HTMLElement | null>(ruler),
          paperRef: ref<HTMLElement | null>(paper),
          scrollRef: ref<HTMLElement | null>(scroll),
          watchSource: source,
        })
        measure = api.measure
        pageLeft = api.pageLeft
        pageWidth = api.pageWidth
        return () => h('div')
      },
    })

    const wrapper = mount(Harness)
    expect(pageLeft.value).toBeNull()
    expect(pageWidth.value).toBeNull()

    measure()
    expect(pageLeft.value).toBe(40)
    expect(pageWidth.value).toBe(300)

    wrapper.unmount()
    document.body.innerHTML = ''
  })
})
