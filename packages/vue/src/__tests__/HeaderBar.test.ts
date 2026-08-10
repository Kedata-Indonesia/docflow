import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HeaderBar from '../components/HeaderBar.vue'

describe('HeaderBar', () => {
  it('focuses and selects the title when Rename is chosen from File', async () => {
    const title = 'Project Brief'
    const wrapper = mount(HeaderBar, {
      props: { title },
      attachTo: document.body,
    })

    const fileButton = wrapper
      .findAll('nav button')
      .find((button) => button.text().trim() === 'File')
    expect(fileButton).toBeDefined()

    await fileButton!.trigger('click')

    const renameButton = wrapper
      .findAll('nav button')
      .find((button) => ['Rename', 'Ubah nama'].includes(button.text().trim()))
    expect(renameButton).toBeDefined()

    await renameButton!.trigger('click')
    await nextTick()
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const titleInput = wrapper.find('input[type="text"]')
    const inputElement = titleInput.element as HTMLInputElement
    expect(titleInput.exists()).toBe(true)
    expect(inputElement).toBe(document.activeElement)
    expect(inputElement.selectionStart).toBe(0)
    expect(inputElement.selectionEnd).toBe(title.length)

    wrapper.unmount()
  })

  it('switches top-level menus on hover after the menu bar is activated', async () => {
    const wrapper = mount(HeaderBar, {
      props: { title: 'Project Brief' },
      attachTo: document.body,
    })

    const topLevelButtons = wrapper.findAll('nav.header-menu-container > div > button')
    const fileButton = topLevelButtons.find((button) => button.text().trim() === 'File')
    const editButton = topLevelButtons.find((button) => button.text().trim() === 'Edit')
    expect(fileButton).toBeDefined()
    expect(editButton).toBeDefined()

    const dropdownsBeforeHover = wrapper.findAll('nav.header-menu-container [class*="min-w"]')
    expect(dropdownsBeforeHover.some((menu) => menu.text().includes('Undo'))).toBe(false)

    await fileButton!.trigger('click')
    expect(wrapper.text()).toContain('Make a copy')

    await editButton!.trigger('mouseenter')
    await nextTick()

    const dropdowns = wrapper.findAll('nav.header-menu-container [class*="min-w"]')
    expect(dropdowns.some((menu) => menu.text().includes('Undo'))).toBe(true)
    expect(dropdowns.some((menu) => menu.text().includes('Make a copy'))).toBe(false)

    await editButton!.trigger('click')
    await nextTick()
    expect(wrapper.findAll('nav.header-menu-container [class*="min-w"]').some((menu) => menu.text().includes('Undo'))).toBe(false)
    wrapper.unmount()
  })
})
