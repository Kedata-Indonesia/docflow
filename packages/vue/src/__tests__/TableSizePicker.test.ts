import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TableSizePicker from '../components/TableSizePicker.vue'

describe('TableSizePicker', () => {
  it('emits the chosen grid size on click (#146)', async () => {
    const wrapper = mount(TableSizePicker, { props: { isOpen: true } })
    await wrapper.find('button[title="2 × 3"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([{ rows: 2, cols: 3 }])
    wrapper.unmount()
  })

  it('shows the hovered size label', async () => {
    const wrapper = mount(TableSizePicker, { props: { isOpen: true } })
    await wrapper.find('button[title="4 × 2"]').trigger('mouseenter')
    expect(wrapper.text()).toContain('4 × 2')
    wrapper.unmount()
  })
})
