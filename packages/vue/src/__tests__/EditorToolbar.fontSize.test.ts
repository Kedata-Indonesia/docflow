import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import { fontSizePlugin } from '@kedata-indonesia/docflow-plugins'
import DocsEditor from '../components/DocsEditor.vue'

/**
 * Regression tests for #158 — the font-size stepper jumped 28 → 36 because the
 * `FONT_SIZES` preset list skipped 30/32/34.
 *
 * `fontSizePlugin` is required here: the stepper's handler issues the
 * `setFontSize` command that plugin registers. The editor is created
 * asynchronously by `useEditor`, so the toolbar controls stay disabled until a
 * tick has passed — hence the `await`s in `setup()`.
 */

const plugins: DocsEditorPlugin[] = [
  {
    id: 'formatting',
    toolbar: [{ id: 'bold', label: 'Bold', action: 'toggleBold' }],
  },
  fontSizePlugin as DocsEditorPlugin,
]

type EditorHost = {
  editor?: {
    commands: {
      focus: () => void
      setContent: (content: object) => void
      setTextSelection: (range: { from: number; to: number }) => void
    }
  }
}

type Wrapper = ReturnType<typeof mount>

async function setup() {
  const wrapper = mount(DocsEditor, { props: { plugins } })
  await wrapper.vm.$nextTick() // let `useEditor` publish the editor to the toolbar

  const host = wrapper.vm as unknown as EditorHost
  host.editor?.commands.focus()
  host.editor?.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] })
  host.editor?.commands.setTextSelection({ from: 1, to: 6 })
  await wrapper.vm.$nextTick()

  return wrapper
}

function sizeInput(wrapper: Wrapper) {
  return wrapper.find('.docs-editor-toolbar input[title="Font size"]')
}

function stepButton(wrapper: Wrapper, direction: 'Increase' | 'Decrease') {
  return wrapper.find(`.docs-editor-toolbar button[title="${direction} font size"]`)
}

function shownSize(wrapper: Wrapper) {
  return (sizeInput(wrapper).element as HTMLInputElement).value
}

/** Type a size into the control and commit it (blur) — the user-facing path. */
async function typeSize(wrapper: Wrapper, value: string) {
  await sizeInput(wrapper).setValue(value)
  await sizeInput(wrapper).trigger('blur')
  await wrapper.vm.$nextTick()
}

/** Click the stepper `times` times, recording the displayed value after each. */
async function step(wrapper: Wrapper, direction: 'Increase' | 'Decrease', times: number) {
  const seen: string[] = []
  for (let i = 0; i < times; i += 1) {
    await stepButton(wrapper, direction).trigger('mousedown')
    await wrapper.vm.$nextTick()
    seen.push(shownSize(wrapper))
  }
  return seen
}

describe('EditorToolbar font-size stepper (#158)', () => {
  it('steps 28 → 30 instead of jumping straight to 36', async () => {
    const wrapper = await setup()
    await typeSize(wrapper, '28')
    expect(shownSize(wrapper)).toBe('28')

    expect(await step(wrapper, 'Increase', 1)).toEqual(['30'])
  })

  it('reaches 36 from 28 in four 2px steps — no gap in the preset list', async () => {
    const wrapper = await setup()
    await typeSize(wrapper, '28')

    expect(await step(wrapper, 'Increase', 4)).toEqual(['30', '32', '34', '36'])
  })

  it('steps back down 30 → 28', async () => {
    const wrapper = await setup()
    await typeSize(wrapper, '30')

    expect(await step(wrapper, 'Decrease', 1)).toEqual(['28'])
  })
})
