import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'
import DocsEditor from '../components/DocsEditor.vue'
import HeaderBar from '../components/HeaderBar.vue'
import EditorToolbar from '../components/EditorToolbar.vue'
import StatusBar from '../components/StatusBar.vue'
import RulerBar from '../components/RulerBar.vue'
import VerticalRuler from '../components/VerticalRuler.vue'
import TOCSidebar from '../components/sidebars/TOCSidebar.vue'

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

  it('toggles pageless mode without touching document content', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: {
        commands: { focus: () => void; insertContent: (content: string) => void }
        getJSON: () => object
        storage: { PaginationPlus?: { enabled: boolean } }
      }
      menuClick: (id: string) => void
    }
    vm.editor?.commands.focus()
    vm.editor?.commands.insertContent('<p>Pageless content</p>')
    await new Promise((resolve) => setTimeout(resolve, 100))

    const contentBefore = JSON.stringify(vm.editor?.getJSON() ?? {})
    expect(vm.editor?.storage.PaginationPlus?.enabled).toBe(true)

    // Switch to pageless — pagination extension disabled, content untouched.
    vm.menuClick('toggle-pageless')
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(wrapper.emitted('update:pageless')?.[0]).toEqual([true])
    expect(vm.editor?.storage.PaginationPlus?.enabled).toBe(false)
    expect(JSON.stringify(vm.editor?.getJSON() ?? {})).toBe(contentBefore)

    // Switch back to paginated — same guarantees in reverse.
    vm.menuClick('toggle-pageless')
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(wrapper.emitted('update:pageless')?.[1]).toEqual([false])
    expect(vm.editor?.storage.PaginationPlus?.enabled).toBe(true)
    expect(JSON.stringify(vm.editor?.getJSON() ?? {})).toBe(contentBefore)

    wrapper.unmount()
  })

  it('toggles the outline sidebar via menuClick(\'toggle-left-sidebar\')', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      menuClick: (id: string) => void
      activeSidebar: string | null
    }

    expect(wrapper.findComponent(TOCSidebar).exists()).toBe(false)

    vm.menuClick('toggle-left-sidebar')
    await wrapper.vm.$nextTick()
    expect(vm.activeSidebar).toBe('toc')
    expect(wrapper.findComponent(TOCSidebar).exists()).toBe(true)

    vm.menuClick('toggle-left-sidebar')
    await wrapper.vm.$nextTick()
    expect(vm.activeSidebar).toBeNull()
    expect(wrapper.findComponent(TOCSidebar).exists()).toBe(false)

    wrapper.unmount()
  })

  it('toggles ruler visibility via menuClick(\'toggle-ruler\')', async () => {
    localStorage.removeItem('docflow:view:showRuler')
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as { menuClick: (id: string) => void }

    expect(wrapper.findComponent(RulerBar).exists()).toBe(true)
    expect(wrapper.findComponent(VerticalRuler).exists()).toBe(true)

    vm.menuClick('toggle-ruler')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(RulerBar).exists()).toBe(false)
    expect(wrapper.findComponent(VerticalRuler).exists()).toBe(false)
    expect(localStorage.getItem('docflow:view:showRuler')).toBe('false')

    vm.menuClick('toggle-ruler')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(RulerBar).exists()).toBe(true)
    expect(wrapper.findComponent(VerticalRuler).exists()).toBe(true)
    expect(localStorage.getItem('docflow:view:showRuler')).toBe('true')

    wrapper.unmount()
  })

  it('toggles focus mode via menuClick(\'toggle-focus-mode\') and exits on Escape', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as { menuClick: (id: string) => void }

    expect(wrapper.findComponent(HeaderBar).exists()).toBe(true)
    expect(wrapper.findComponent(EditorToolbar).exists()).toBe(true)
    expect(wrapper.findComponent(StatusBar).exists()).toBe(true)

    vm.menuClick('toggle-focus-mode')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(HeaderBar).exists()).toBe(false)
    expect(wrapper.findComponent(EditorToolbar).exists()).toBe(false)
    expect(wrapper.findComponent(StatusBar).exists()).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(HeaderBar).exists()).toBe(true)
    expect(wrapper.findComponent(EditorToolbar).exists()).toBe(true)
    expect(wrapper.findComponent(StatusBar).exists()).toBe(true)

    wrapper.unmount()
  })

  it('opens footer modal with left/right inputs on double click (detail: 2)', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      paginationOptions: {
        onHeaderClick: (params: { event: { detail: number } }) => void
        onFooterClick: (params: { event: { detail: number } }) => void
      }
      showFooterModal: boolean
      footerLeftInput: string
      footerRightInput: string
    }

    // Single click: detail = 1 -> modal does not open
    vm.paginationOptions.onFooterClick({ event: { detail: 1 } })
    await wrapper.vm.$nextTick()
    expect(vm.showFooterModal).toBe(false)

    // Double click footer: detail = 2 -> opens footer modal
    vm.paginationOptions.onFooterClick({ event: { detail: 2 } })
    await wrapper.vm.$nextTick()
    expect(vm.showFooterModal).toBe(true)

    // Verify modal has left and right input fields
    expect(wrapper.find('input[placeholder*="Confidential"], input[placeholder*="Rahasia"]').exists()).toBe(true)

    wrapper.unmount()
  })

  it('supports Different First Page and Different Odd/Even optional header settings', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      isDifferentFirstPage: boolean
      isDifferentOddEven: boolean
      applyHeaderFooter: () => void
    }

    expect(vm.isDifferentFirstPage).toBe(false)
    expect(vm.isDifferentOddEven).toBe(false)

    // Toggle different first page
    vm.isDifferentFirstPage = true
    await wrapper.vm.$nextTick()
    expect(vm.isDifferentFirstPage).toBe(true)

    // Toggle different odd/even
    vm.isDifferentOddEven = true
    await wrapper.vm.$nextTick()
    expect(vm.isDifferentOddEven).toBe(true)

    wrapper.unmount()
  })

  it('supports Header & Footer format modal margin customization with draft states', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      showHeaderFormatModal: boolean
      headerMarginCm: number
      footerMarginCm: number
      draftHeaderMarginCm: number
      draftFooterMarginCm: number
      openHeaderFormatModal: () => void
      applyHeaderFormat: () => void
    }

    expect(vm.showHeaderFormatModal).toBe(false)
    vm.openHeaderFormatModal()
    await wrapper.vm.$nextTick()
    expect(vm.showHeaderFormatModal).toBe(true)

    // Set draft margins (does not touch active headerMarginCm until apply)
    vm.draftHeaderMarginCm = 2.0
    vm.draftFooterMarginCm = 2.0
    expect(vm.headerMarginCm).toBe(1.27)

    vm.applyHeaderFormat()
    await wrapper.vm.$nextTick()

    expect(vm.showHeaderFormatModal).toBe(false)
    expect(vm.headerMarginCm).toBe(2.0)
    expect(vm.footerMarginCm).toBe(2.0)

    wrapper.unmount()
  })

  it('supports Page Number modal settings with draft states (position, start at, show on first page)', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      showPageNumberModal: boolean
      pageNumberPosition: 'header' | 'footer'
      showPageNumberOnFirstPage: boolean
      pageNumberStartAt: number
      draftPageNumberPosition: 'header' | 'footer'
      draftShowPageNumberOnFirstPage: boolean
      draftPageNumberStartAt: number
      userHeaderRight: string
      userFooterRight: string
      openPageNumberModal: () => void
      applyPageNumberSettings: () => void
    }

    expect(vm.showPageNumberModal).toBe(false)
    vm.openPageNumberModal()
    await wrapper.vm.$nextTick()
    expect(vm.showPageNumberModal).toBe(true)

    // Configure page number settings to header first
    vm.draftPageNumberPosition = 'header'
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()
    expect(vm.userHeaderRight).toBe('{page}')

    // Open modal again and set draft position to footer -> clears header page token only on apply
    vm.openPageNumberModal()
    vm.draftPageNumberPosition = 'footer'
    vm.draftShowPageNumberOnFirstPage = false
    vm.draftPageNumberStartAt = 5
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()

    expect(vm.showPageNumberModal).toBe(false)
    expect(vm.pageNumberPosition).toBe('footer')
    expect(vm.userHeaderRight).toBe('')
    expect(vm.userFooterRight).toBe('{page}')
    expect(vm.showPageNumberOnFirstPage).toBe(false)
    expect(vm.pageNumberStartAt).toBe(5)

    wrapper.unmount()
  })
})

