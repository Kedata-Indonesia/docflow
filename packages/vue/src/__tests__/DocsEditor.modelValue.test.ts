import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DocsEditor from '../components/DocsEditor.vue'

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
    getJSON: () => object
    getText: () => string
    commands: { focus: () => void; insertContent: (value: string) => void }
    state: { selection: { from: number } }
  }
}

const editorOf = (wrapper: ReturnType<typeof mount>): EditorHandle['editor'] =>
  (wrapper.vm as unknown as EditorHandle).editor

const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))

describe('DocsEditor modelValue after mount (#370)', () => {
  it('replaces the document when the host writes modelValue', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)
    expect(editor?.getText()).toContain('Alpha')
    const emitsBefore = wrapper.emitted('update:modelValue')?.length ?? 0

    await wrapper.setProps({ modelValue: docB })
    await wrapper.vm.$nextTick()

    expect(editor?.getText()).toContain('Bravo')
    expect(editor?.getText()).not.toContain('Alpha')
    // The host already owns the value; applying it must not echo an update.
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(emitsBefore)
    wrapper.unmount()
  })

  it('keeps the caret when a v-model host echoes the emitted document', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)
    editor?.commands.focus()
    editor?.commands.insertContent('typed')

    const emitted = wrapper.emitted('update:modelValue') ?? []
    expect(emitted.length).toBeGreaterThan(0)
    const caretBefore = editor?.state.selection.from

    await wrapper.setProps({ modelValue: emitted.at(-1)![0] as object })
    await wrapper.vm.$nextTick()

    expect(editor?.state.selection.from).toBe(caretBefore)
    expect(editor?.getText()).toContain('typed')
    wrapper.unmount()
  })

  it('applies a host write that reverts to an older emitted document', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)
    editor?.commands.focus()
    editor?.commands.insertContent('typed')
    const olderEmitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as object

    await wrapper.setProps({ modelValue: docB })
    await wrapper.vm.$nextTick()
    expect(editor?.getText()).toContain('Bravo')

    // The host switches back to the document it emitted before the switch;
    // this is a real write, not an echo of the current state.
    await wrapper.setProps({ modelValue: olderEmitted })
    await wrapper.vm.$nextTick()
    expect(editor?.getText()).toContain('typed')
    expect(editor?.getText()).not.toContain('Bravo')
    wrapper.unmount()
  })

  it('applies header/footer slots carried by a tabbed document', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()

    await wrapper.setProps({
      modelValue: {
        type: 'tabbed-doc',
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', label: 'Tab 1', content: docA }],
        headerLeft: 'Header dari host',
      },
    })
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as unknown as { userHeaderLeft: string }
    expect(vm.userHeaderLeft).toBe('Header dari host')
    wrapper.unmount()
  })

  it('switches to the active tab of a host-written tabbed document', async () => {
    const wrapper = mount(DocsEditor, { props: { modelValue: docA } })
    await settle()
    const editor = editorOf(wrapper)

    await wrapper.setProps({
      modelValue: {
        type: 'tabbed-doc',
        activeTabId: 'tab-2',
        tabs: [
          { id: 'tab-1', label: 'One', content: docA },
          { id: 'tab-2', label: 'Two', content: docB },
        ],
      },
    })
    await wrapper.vm.$nextTick()
    expect(editor?.getText()).toContain('Bravo')

    editor?.commands.focus()
    editor?.commands.insertContent('!')
    const last = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as
      | { activeTabId: string; tabs: Array<{ id: string; content: object }> }
      | undefined
    expect(last?.activeTabId).toBe('tab-2')
    expect(JSON.stringify(last?.tabs.find(t => t.id === 'tab-2')?.content)).toContain('Bravo')
    wrapper.unmount()
  })
})
