import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ToolbarZoom from '../components/toolbar/ToolbarZoom.vue'

describe('ToolbarZoom (#144)', () => {
  it('shows the current percentage and applies a preset', async () => {
    const wrapper = mount(ToolbarZoom, { props: { zoom: 100, open: false } })
    expect(wrapper.get('[data-testid="toolbar-zoom"]').text()).toContain('100%')

    await wrapper.setProps({ open: true })
    const options = wrapper.get('[data-testid="toolbar-zoom-menu"]').findAll('button')
    expect(options.map((option) => option.text())).toEqual(['50%', '75%', '100%', '125%', '150%', '200%'])

    await options[4].trigger('click')
    expect(wrapper.emitted('apply')?.[0]).toEqual([150])
    wrapper.unmount()
  })

  it('disables the control while virtual pages are on', () => {
    const wrapper = mount(ToolbarZoom, { props: { zoom: 100, open: false, disabled: true } })
    const trigger = wrapper.get('[data-testid="toolbar-zoom"]')
    expect(trigger.attributes('disabled')).toBeDefined()
    expect(trigger.attributes('title')).toContain('virtual pages')
    wrapper.unmount()
  })
})
