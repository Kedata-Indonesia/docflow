import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'
import DocsEditor from '../components/DocsEditor.vue'

const defaultPlugins: DocsEditorPlugin[] = [
  {
    id: 'formatting',
    toolbar: [
      { id: 'bold', label: 'Bold', action: 'toggleBold' },
      { id: 'italic', label: 'Italic', action: 'toggleItalic' },
      { id: 'underline', label: 'Underline', action: 'toggleUnderline' },
    ],
  },
  {
    id: 'link',
    toolbar: [{ id: 'link', label: 'Link', action: 'setLink' }],
    commands: {
      setLink: (editor: Editor) => editor.commands.insertContent('link'),
    },
  },
]

describe('DocsEditor', () => {
  it('renders the editor container', () => {
    const wrapper = mount(DocsEditor)
    expect(wrapper.find('.docs-editor').exists()).toBe(true)
    expect(wrapper.find('.docs-editor__paper').exists()).toBe(true)
  })

  it('renders toolbar when plugins are provided', () => {
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [
          {
            id: 'formatting',
            toolbar: [{ id: 'bold', label: 'Bold', action: 'toggleBold', iconComponent: 'Bold' }],
          },
        ],
      },
    })
    expect(wrapper.find('.docs-editor-toolbar').exists()).toBe(true)
    expect(wrapper.find('.docs-editor-toolbar__button').attributes('title')).toBe('Bold')
  })

  it('invokes toolbar actions with configured args', async () => {
    const receivedArgs: unknown[] = []
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [
          {
            id: 'args-test',
            toolbar: [{ id: 'test', label: 'Test', action: 'testAction', args: [{ foo: 'bar' }] }],
            commands: {
              testAction: (_editor: Editor, ...args: unknown[]) => {
                receivedArgs.push(args)
                return true
              },
            },
          },
        ],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const button = wrapper.find('.docs-editor-toolbar__button')
    expect(button.exists()).toBe(true)
    await button.trigger('click')

    expect(receivedArgs).toHaveLength(1)
    expect((receivedArgs[0] as { foo: string }[])[0]).toEqual({ foo: 'bar' })
    wrapper.unmount()
  })

  it('renders bubble menu when text is selected', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const editor = (wrapper.vm as unknown as { editor?: { commands: { focus: () => void; selectAll: () => void } } }).editor
    editor?.commands.focus()
    editor?.commands.selectAll()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="bubble-menu"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders page view with real content text', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: { commands: { focus: () => void; insertContent: (content: string) => void } }
    }
    vm.editor?.commands.focus()
    vm.editor?.commands.insertContent('<p>Hello world</p>')
    await new Promise((resolve) => setTimeout(resolve, 250))
    await wrapper.vm.$nextTick()

    // The paper div is the single contenteditable host; content is rendered inside it.
    expect(wrapper.find('.docs-editor__paper').exists()).toBe(true)
    expect(wrapper.find('.docs-editor__paper').text()).toContain('Hello world')
    wrapper.unmount()
  })

  it('does not insert synthetic pageBreak nodes into ProseMirror state', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins, pageSize: 'a4' },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: {
        commands: { focus: () => void; insertContent: (content: string) => void }
        getJSON: () => object
      }
    }
    vm.editor?.commands.focus()
    // Insert enough paragraphs to overflow an A4 page so layout would want multiple pages.
    const longContent = Array.from({ length: 60 }, (_, i) => `<p>Line ${i} ${'x '.repeat(40)}</p>`).join('')
    vm.editor?.commands.insertContent(longContent)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await wrapper.vm.$nextTick()

    const json = JSON.stringify(vm.editor?.getJSON() ?? {})
    expect(json).not.toContain('"type":"pageBreak"')
    // The paper div (single contenteditable host) always exists
    expect(wrapper.findAll('.docs-editor__paper').length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })

  it('can insert footnote and render its ref element', async () => {
    const { footnotePlugin } = await import('../../../plugins/src/footnote')
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [...defaultPlugins, footnotePlugin],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as { editor?: { commands: { focus: () => void } }; menuClick: (id: string) => void }
    vm.editor?.commands.focus()
    // Trigger insert footnote menu action
    vm.menuClick('insert-footnote')

    await new Promise((resolve) => setTimeout(resolve, 250))
    await wrapper.vm.$nextTick()

    // Footnote ref span should be rendered
    const ref = wrapper.find('.docs-footnote-ref')
    expect(ref.exists()).toBe(true)
    expect(ref.text()).toBe('1')

    wrapper.unmount()
  })
})

