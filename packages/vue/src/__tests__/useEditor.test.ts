/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useEditor } from '../composables/useEditor.js'

describe('useEditor', () => {
  it('creates and destroys an editor', async () => {
    let captured: ReturnType<typeof useEditor> | null = null

    const TestComponent = defineComponent({
      setup() {
        const instance = useEditor({})
        captured = instance
        return () => h('div', { ref: instance.editorRef })
      },
    })

    const wrapper = mount(TestComponent)
    await nextTick()

    expect(captured).not.toBeNull()
    expect(captured!.isReady.value).toBe(true)
    expect(captured!.docsEditor.value).not.toBeNull()
    expect(captured!.editor.value).not.toBeNull()

    wrapper.unmount()
    await nextTick()

    expect(captured!.docsEditor.value).toBeNull()
    expect(captured!.isReady.value).toBe(false)
  })

  it('emits onUpdate when content changes', async () => {
    const onUpdate = vi.fn()
    let captured: ReturnType<typeof useEditor> | null = null

    const TestComponent = defineComponent({
      setup() {
        const instance = useEditor({ onUpdate })
        captured = instance
        return () => h('div', { ref: instance.editorRef })
      },
    })

    mount(TestComponent)
    await nextTick()

    captured!.editor.value?.commands.focus('end')
    captured!.editor.value?.commands.insertContent('hello')
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onUpdate).toHaveBeenCalled()
  })

  it('reflects editable prop changes', async () => {
    let captured: ReturnType<typeof useEditor> | null = null

    const TestComponent = defineComponent({
      setup() {
        const instance = useEditor({ editable: true })
        captured = instance
        return () => h('div', { ref: instance.editorRef })
      },
    })

    mount(TestComponent)
    await nextTick()

    expect(captured!.editor.value?.isEditable).toBe(true)
  })
})
