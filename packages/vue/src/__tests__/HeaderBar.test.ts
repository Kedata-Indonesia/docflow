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
})
