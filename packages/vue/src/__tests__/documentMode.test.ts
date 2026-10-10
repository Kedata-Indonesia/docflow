import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import DocsEditor from '../components/DocsEditor.vue'
import HeaderBar from '../components/HeaderBar.vue'

/**
 * Document modes (#27/#28). The regression this guards: the View ▸ Document
 * mode menu must work even when the host does **not** bind `v-model:mode`
 * (previously `mode` was fully controlled, so the menu emitted `update:mode`
 * into the void and nothing changed).
 */
const mountEditor = async (props: Record<string, unknown> = {}) => {
  const wrapper = mount(DocsEditor, { props })
  await new Promise((resolve) => setTimeout(resolve, 50))
  return wrapper
}

const vmOf = (wrapper: ReturnType<typeof mount>) => wrapper.vm as unknown as { documentMode: string }

describe('document mode (#27/#28)', () => {
  it('switches via the menu without a bound prop (uncontrolled)', async () => {
    const wrapper = await mountEditor()
    expect(vmOf(wrapper).documentMode).toBe('editing')

    wrapper.findComponent(HeaderBar).vm.$emit('menu-click', 'mode-suggesting')
    await nextTick()

    expect(vmOf(wrapper).documentMode).toBe('suggesting')
    expect(wrapper.emitted('update:mode')?.[0]).toEqual(['suggesting'])
    wrapper.unmount()
  })

  it('maps editable=false to viewing', async () => {
    const wrapper = await mountEditor({ editable: false })
    expect(vmOf(wrapper).documentMode).toBe('viewing')
    wrapper.unmount()
  })

  it('lets the mode prop control the state', async () => {
    const wrapper = await mountEditor({ mode: 'suggesting' })
    expect(vmOf(wrapper).documentMode).toBe('suggesting')

    // Controlled: the menu emits, but the prop still wins until the host updates it.
    wrapper.findComponent(HeaderBar).vm.$emit('menu-click', 'mode-editing')
    await nextTick()
    expect(vmOf(wrapper).documentMode).toBe('suggesting')
    wrapper.unmount()
  })
})
