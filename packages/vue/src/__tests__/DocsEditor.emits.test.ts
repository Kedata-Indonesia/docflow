import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DocsEditor from '../components/DocsEditor.vue'
import { MODEL_UPDATE_DEBOUNCE_MS } from '../composables/useDocumentModel.js'

const docA = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }],
}
const docB = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bravo' }] }],
}

interface EditorHandle {
  editor?: {
    getText: () => string
    commands: { focus: () => void; blur: () => void; insertContent: (value: string) => void }
  }
}

const editorOf = (wrapper: ReturnType<typeof mount>): EditorHandle['editor'] =>
  (wrapper.vm as unknown as EditorHandle).editor

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))
const afterDebounce = () => settle(MODEL_UPDATE_DEBOUNCE_MS + 50)

const emittedDocs = (wrapper: ReturnType<typeof mount>): Array<Record<string, unknown>> =>
  (wrapper.emitted('update:modelValue') ?? []).map(entry => entry[0] as Record<string, unknown>)

const emittedText = (wrapper: ReturnType<typeof mount>): string => {
  const last = emittedDocs(wrapper).at(-1) as
    | { tabs?: Array<{ content?: unknown }> }
    | undefined
  return JSON.stringify(last?.tabs?.[0]?.content ?? '')
}

describe('DocsEditor update:modelValue debounce (#374)', () => {
  it('coalesces a burst of keystrokes into one trailing emit', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)

    editor?.commands.focus()
    editor?.commands.insertContent('a')
    editor?.commands.insertContent('b')
    editor?.commands.insertContent('c')

    // Nothing yet: the burst is still inside the trailing window.
    expect(emittedDocs(wrapper)).toHaveLength(0)
    await settle(MODEL_UPDATE_DEBOUNCE_MS - 100)
    expect(emittedDocs(wrapper)).toHaveLength(0)

    await afterDebounce()
    expect(emittedDocs(wrapper)).toHaveLength(1)
    expect(emittedText(wrapper)).toContain('abc')
    wrapper.unmount()
  })

  it('flushes the pending document when the element unmounts', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)

    editor?.commands.focus()
    editor?.commands.insertContent('bye')
    expect(emittedDocs(wrapper)).toHaveLength(0)

    wrapper.unmount()

    expect(emittedDocs(wrapper)).toHaveLength(1)
    expect(emittedText(wrapper)).toContain('bye')
  })

  it('flushes the pending document when the editor loses focus', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper) as NonNullable<EditorHandle['editor']> & {
      view: { dom: HTMLElement }
    }

    editor.commands.focus()
    editor.commands.insertContent('blurred')
    expect(emittedDocs(wrapper)).toHaveLength(0)

    // Real DOM blur: ProseMirror dispatches it as the tiptap `blur` event.
    editor.view.dom.dispatchEvent(new FocusEvent('blur'))
    await wrapper.vm.$nextTick()

    expect(emittedDocs(wrapper)).toHaveLength(1)
    expect(emittedText(wrapper)).toContain('blurred')
    wrapper.unmount()
  })

  it('drops a queued edit when the host replaces the document', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)

    editor?.commands.focus()
    editor?.commands.insertContent('typed')

    await wrapper.setProps({ modelValue: docB })
    await wrapper.vm.$nextTick()
    expect(editor?.getText()).toContain('Bravo')

    // The host value superseded the queued emit; nothing stale may follow.
    await afterDebounce()
    expect(emittedDocs(wrapper)).toHaveLength(0)
    expect(editor?.getText()).not.toContain('typed')
    wrapper.unmount()
  })
})
