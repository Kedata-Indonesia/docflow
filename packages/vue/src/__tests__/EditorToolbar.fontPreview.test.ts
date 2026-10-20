import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DocsEditor from '../components/DocsEditor.vue'

/**
 * Regression test for #188 — the font-family dropdown listed every font as
 * plain text, so users could not compare the actual typefaces before picking
 * one. Each option must render in the font it selects, and the trigger must
 * show the active font.
 */

async function openFontDropdown() {
  const wrapper = mount(DocsEditor)
  await wrapper.vm.$nextTick() // let `useEditor` publish the editor to the toolbar

  await wrapper.find('.docs-editor-toolbar button[title="Font family"]').trigger('click')
  await wrapper.vm.$nextTick()

  const options = wrapper.findAll('.docs-editor-toolbar .toolbar-dropdown > div > button')
  const trigger = wrapper.find('.docs-editor-toolbar button[title="Font family"]')
  return { wrapper, options, trigger }
}

describe('EditorToolbar font-family preview (#188)', () => {
  it('renders each option in its own font stack', async () => {
    const { options } = await openFontDropdown()

    // 14 fonts ship in FONT_OPTIONS; the dropdown holds one button per entry.
    expect(options).toHaveLength(14)

    const inter = options.find((opt) => opt.text() === 'Inter')
    const times = options.find((opt) => opt.text() === 'Times New Roman')

    expect(inter?.attributes('style')).toContain('font-family: Inter')
    expect(times?.attributes('style')).toContain('Times New Roman')
  })

  it('renders the trigger label in the active font stack', async () => {
    const { trigger } = await openFontDropdown()

    expect(trigger.attributes('style')).toContain('font-family: Inter')
  })
})
