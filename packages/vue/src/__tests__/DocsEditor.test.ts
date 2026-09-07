import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createCollaboration, type DocsEditorPlugin, type AIStreamFn } from '@kedata-indonesia/docflow-core'
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

  it('emits ai-chat from the bubble Chat button when the host subscribes (issue #219)', async () => {
    const onAiChat = vi.fn()
    const aiStream = (async function* () { yield '' }) as AIStreamFn
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins, aiStream, onAiChat },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const editor = (wrapper.vm as unknown as {
      editor?: { commands: { setContent: (c: object) => boolean; focus: () => void; selectAll: () => void } }
    }).editor
    editor?.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Selected sentence' }] }],
    })
    editor?.commands.focus()
    editor?.commands.selectAll()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="bubble-chat"]').exists()).toBe(true)
    await wrapper.find('[data-testid="bubble-chat"]').trigger('click')

    // The host owns the chat panel → onAiChat fires with the selection +
    // location payload, and the built-in AI sidebar is NOT opened as fallback.
    expect(onAiChat).toHaveBeenCalledTimes(1)
    const payload = onAiChat.mock.calls[0][0] as { selection?: string; context: object }
    expect(payload.selection).toContain('Selected sentence')
    expect(payload.context).toEqual(expect.any(Object))
    expect(wrapper.find('.ai-sidebar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('falls back to the built-in AI sidebar when no host subscribes to ai-chat (issue #219)', async () => {
    const aiStream = (async function* () { yield '' }) as AIStreamFn
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins, aiStream },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const editor = (wrapper.vm as unknown as { editor?: { commands: { focus: () => void; selectAll: () => void } } }).editor
    editor?.commands.focus()
    editor?.commands.selectAll()
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="bubble-chat"]').trigger('click')

    // No onAiChat handler on the host → the built-in AI sidebar opens.
    expect(wrapper.find('.ai-sidebar').exists()).toBe(true)
    wrapper.unmount()
  })

  it('anchors the bubble menu to the active selection endpoint', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: {
        commands: {
          setContent: (content: object) => boolean
          setTextSelection: (selection: { from: number; to: number }) => boolean
        }
        view: { coordsAtPos: (pos: number) => { top: number; left: number; right: number } }
      }
      computeBubblePosition: () => { top: number; left: number } | null
    }

    expect(vm.editor).toBeDefined()
    vm.editor!.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Selection test content' }] }],
    })
    vm.editor!.commands.setTextSelection({ from: 2, to: 8 })
    vm.editor!.view.coordsAtPos = (pos) => ({ top: 100, left: pos * 10, right: pos * 10 + 4 })

    const position = vm.computeBubblePosition()

    // Coordinates are clamped to keep the toolbar visible in the viewport;
    // the near-left coordinate is raised to the minimum safe center point.
    expect(position).toEqual({ top: 52, left: 192 })
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

  it('renders task list content with an inline checkbox and text column', async () => {
    const { listsPlugin } = await import('../../../plugins/src/lists')
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [listsPlugin],
        modelValue: {
          type: 'doc',
          content: [{
            type: 'taskList',
            content: [{
              type: 'taskItem',
              attrs: { checked: false },
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: 'Task item' }],
              }],
            }],
          }],
        },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: { commands: { setContent: (content: object) => void } }
    }
    vm.editor?.commands.setContent({
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: false },
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: 'Task item' }],
          }],
        }],
      }],
    })
    await wrapper.vm.$nextTick()
    const taskItem = wrapper.element.querySelector('ul[data-type="taskList"] > li')
    expect(taskItem).not.toBeNull()
    const label = taskItem?.querySelector('label')
    const content = taskItem?.querySelector(':scope > div')

    expect(label?.querySelector('input[type="checkbox"]')).not.toBeNull()
    expect(content?.querySelector(':scope > p')?.textContent).toBe('Task item')

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

  it('opens inline footer edit only on double click (single click does nothing, no legacy modal)', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      paginationOptions: {
        onFooterClick: (params: { event: { detail: number } }) => void
      }
    }

    // Single click footer: detail = 1 -> NO inline edit, NO modal
    vm.paginationOptions.onFooterClick({ event: { detail: 1 } })
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.rm-footer-edit-overlay')).toBeNull()
    expect(document.querySelector('input[placeholder*="Confidential"], input[placeholder*="Rahasia"]')).toBeNull()

    // Double click footer: detail = 2 -> inline edit overlay appears
    vm.paginationOptions.onFooterClick({ event: { detail: 2 } })
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.rm-footer-edit-overlay')).not.toBeNull()
    // Legacy footer modal (left/right inputs) must not exist anywhere
    expect(document.querySelector('input[placeholder*="Confidential"], input[placeholder*="Rahasia"]')).toBeNull()

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

  it('edits the header outside ProseMirror without changing document content', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      editor?: { getJSON: () => object }
      startInlineHeaderEdit: () => void
      finishHeaderEdit: (commit?: boolean) => void
      userHeaderLeft: string
    }
    expect(vm.editor).toBeDefined()
    const before = JSON.stringify(vm.editor?.getJSON() ?? {})

    vm.startInlineHeaderEdit()
    await wrapper.vm.$nextTick()

    const overlay = document.querySelector('.rm-header-edit-overlay') as HTMLElement | null
    const input = overlay?.querySelector('.rm-header-edit-input') as HTMLElement | null
    const activeBar = overlay?.querySelector('.rm-google-docs-header-bar') as HTMLElement | null
    expect(overlay).not.toBeNull()
    expect(input?.contentEditable).toBe('true')
    expect(input?.closest('.docs-editor__paper')).toBeNull()
    expect(activeBar?.parentElement).toBe(overlay)
    expect(activeBar).toBeTruthy()

    input!.innerHTML = 'Safe header'
    vm.finishHeaderEdit(true)

    expect(vm.userHeaderLeft).toBe('Safe header')
    expect(JSON.stringify(vm.editor?.getJSON() ?? {})).toBe(before)
    expect(document.querySelector('.rm-header-edit-overlay')).toBeNull()
    wrapper.unmount()
  })

  it('edits the footer inline (Google Docs style) without changing document content', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      editor?: { getJSON: () => object }
      startInlineFooterEdit: () => void
      finishFooterEdit: (commit?: boolean) => void
      clearFooterContent: () => void
      userFooterLeft: string
      userFooterRight: string
    }
    expect(vm.editor).toBeDefined()
    const before = JSON.stringify(vm.editor?.getJSON() ?? {})

    vm.startInlineFooterEdit()
    await wrapper.vm.$nextTick()

    const overlay = document.querySelector('.rm-footer-edit-overlay') as HTMLElement | null
    const input = overlay?.querySelector('.rm-footer-edit-input') as HTMLElement | null
    const activeBar = overlay?.querySelector('.rm-google-docs-footer-bar') as HTMLElement | null
    expect(overlay).not.toBeNull()
    expect(input?.contentEditable).toBe('true')
    expect(input?.closest('.docs-editor__paper')).toBeNull()
    expect(activeBar?.parentElement).toBe(overlay)
    expect(activeBar).toBeTruthy()

    // Footer toolbar offers page-number access + remove footer
    const dropdown = activeBar?.querySelector('.rm-options-dropdown')
    expect(dropdown?.querySelector('.rm-opt-page-num')).toBeTruthy()
    expect(dropdown?.querySelector('.rm-opt-remove')).toBeTruthy()

    input!.innerHTML = 'Safe footer'
    vm.finishFooterEdit(true)

    expect(vm.userFooterLeft).toBe('Safe footer')
    expect(JSON.stringify(vm.editor?.getJSON() ?? {})).toBe(before)
    expect(document.querySelector('.rm-footer-edit-overlay')).toBeNull()

    // Remove footer clears both slots and persists
    vm.clearFooterContent()
    expect(vm.userFooterLeft).toBe('')
    expect(vm.userFooterRight).toBe('')
    wrapper.unmount()
  })

  it('syncs the page number modal position radio from the actual {page} token location', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      userHeaderRight: string
      userFooterRight: string
      pageNumberPosition: 'header' | 'footer'
      draftPageNumberPosition: 'header' | 'footer'
      showPageNumberModal: boolean
      openPageNumberModal: () => void
      applyPageNumberSettings: () => void
    }

    // Token di footer (default FE) → radio "Footer", bukan state usang 'header'
    vm.userFooterRight = '{page}'
    vm.userHeaderRight = ''
    vm.openPageNumberModal()
    await wrapper.vm.$nextTick()
    expect(vm.showPageNumberModal).toBe(true)
    expect(vm.draftPageNumberPosition).toBe('footer')
    expect(vm.pageNumberPosition).toBe('footer')

    // "Terapkan" tanpa mengubah posisi TIDAK memindahkan token ke header
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()
    expect(vm.userFooterRight).toBe('{page}')
    expect(vm.userHeaderRight).toBe('')

    // Token di header → radio "Header"
    vm.userFooterRight = ''
    vm.userHeaderRight = '{page}'
    vm.openPageNumberModal()
    expect(vm.draftPageNumberPosition).toBe('header')
    expect(vm.pageNumberPosition).toBe('header')

    wrapper.unmount()
  })

  it('parses headerAlign/footerAlign from the model and persists them via the page-number modal', async () => {
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: defaultPlugins,
        modelValue: {
          type: 'tabbed-doc',
          activeTabId: 'tab-1',
          tabs: [{ id: 'tab-1', label: 'Tab 1', content: { type: 'doc', content: [] } }],
          footerLeft: 'Rahasia',
          footerRight: '{page}',
          footerAlign: 'center',
          headerAlign: 'left',
        },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      userFooterAlign: 'left' | 'center' | 'right' | undefined
      userHeaderAlign: 'left' | 'center' | 'right' | undefined
      draftFooterAlign: 'left' | 'center' | 'right' | undefined
      draftPageNumberPosition: 'header' | 'footer'
      openPageNumberModal: () => void
      applyPageNumberSettings: () => void
      toggleDraftPlacement: (align: 'left' | 'center' | 'right') => void
      userFooterLeft: string
    }
    expect(vm.userFooterAlign).toBe('center')
    expect(vm.userHeaderAlign).toBe('left')

    // Buka modal → draft peletakkan mengikuti Posisi (token ada di footer)
    vm.openPageNumberModal()
    await wrapper.vm.$nextTick()
    expect(vm.draftPageNumberPosition).toBe('footer')
    expect(vm.draftFooterAlign).toBe('center')

    // Pilih "kanan" di modal → Terapkan → footerAlign = 'right' + emit update:modelValue
    vm.toggleDraftPlacement('right')
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()
    expect(vm.userFooterAlign).toBe('right')

    const emitted = wrapper.emitted('update:modelValue')
    const last = (emitted ?? [])[(emitted?.length ?? 1) - 1]?.[0] as { footerAlign?: string; headerAlign?: string }
    expect(last.footerAlign).toBe('right')
    expect(last.headerAlign).toBe('left')

    // Buka lagi, klik tombol yang sedang aktif → toggle kembali ke undefined (tata letak default)
    vm.openPageNumberModal()
    await wrapper.vm.$nextTick()
    expect(vm.draftFooterAlign).toBe('right')
    vm.toggleDraftPlacement('right')
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()
    expect(vm.userFooterAlign).toBeUndefined()

    wrapper.unmount()
  })

  it('applies the header/footer align class on the editor root via the modal', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      editor?: { view: { dom: HTMLElement } }
      userFooterAlign: 'left' | 'center' | 'right' | undefined
      userHeaderAlign: 'left' | 'center' | 'right' | undefined
      userFooterRight: string
      draftPageNumberPosition: 'header' | 'footer'
      openPageNumberModal: () => void
      applyPageNumberSettings: () => void
      toggleDraftPlacement: (align: 'left' | 'center' | 'right') => void
    }
    const root = vm.editor!.view.dom
    // Default: tanpa class align
    expect(root.classList.contains('rm-hf-footer-align-right')).toBe(false)
    expect(root.classList.contains('rm-hf-header-align-right')).toBe(false)

    // Footer align kanan via modal (token di footer → Posisi = Footer)
    vm.userFooterRight = '{page}'
    vm.openPageNumberModal()
    await wrapper.vm.$nextTick()
    expect(vm.draftPageNumberPosition).toBe('footer')
    vm.toggleDraftPlacement('right')
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()
    expect(root.classList.contains('rm-hf-footer-align-right')).toBe(true)
    expect(root.classList.contains('rm-hf-header-align-right')).toBe(false)

    // Header align tengah via modal (Posisi dipindah ke Header; footer tetap kanan)
    vm.openPageNumberModal()
    await wrapper.vm.$nextTick()
    vm.draftPageNumberPosition = 'header'
    vm.toggleDraftPlacement('center')
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()
    expect(root.classList.contains('rm-hf-header-align-center')).toBe(true)
    expect(root.classList.contains('rm-hf-footer-align-right')).toBe(true)

    wrapper.unmount()
  })

  it('aligns the later-page edit overlay to the body margins and header content rect', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      editor?: { view: { dom: HTMLElement } }
      startInlineHeaderEdit: (event?: { target: HTMLElement }) => void
      finishHeaderEdit: (commit?: boolean) => void
      userHeaderLeft: string
    }
    const root = vm.editor!.view.dom
    root.style.setProperty('--rm-margin-left', '38px')
    root.style.setProperty('--rm-margin-right', '76px')

    // happy-dom does not resolve custom properties through getComputedStyle,
    // so spy it for the paper root (real browsers return the inline values).
    const originalGetComputedStyle = window.getComputedStyle.bind(window)
    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudoElt?: string | null) => {
      const style = originalGetComputedStyle(el, pseudoElt)
      if (el === root) {
        const originalGetPropertyValue = style.getPropertyValue.bind(style)
        style.getPropertyValue = (prop: string) => {
          if (prop === '--rm-margin-left') return '38px'
          if (prop === '--rm-margin-right') return '76px'
          return originalGetPropertyValue(prop)
        }
      }
      return style
    })

    // The trailing `.rm-page-break` header is the page-2 header slot. It is a
    // full-bleed element whose content is inset by the body margins.
    const header = root.querySelector('.rm-page-break .rm-page-header') as HTMLElement | null
    expect(header).not.toBeNull()
    const content = header!.querySelector('.rm-page-header-content') as HTMLElement
    expect(content).not.toBeNull()

    const rect = (r: { left: number; top: number; width: number; height: number }) =>
      ({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => ({}) }) as DOMRect
    root.getBoundingClientRect = () => rect({ left: 100, top: 50, width: 800, height: 1000 })
    header!.getBoundingClientRect = () => rect({ left: 101, top: 500, width: 798, height: 118 })
    content.getBoundingClientRect = () => rect({ left: 101, top: 519, width: 798, height: 24 })

    vm.startInlineHeaderEdit({ target: header! })
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await new Promise((resolve) => setTimeout(resolve, 20))

    const overlays = document.querySelectorAll('.rm-header-edit-overlay')
    expect(overlays).toHaveLength(1)
    const overlay = overlays[0] as HTMLElement
    expect(overlay.style.left).toBe('139px') // 101 + 38 body margin-left
    expect(overlay.style.top).toBe('519px') // content top, not element top
    expect(overlay.style.width).toBe('684px') // (899 - 76 margin-right) - 139

    const activeBar = overlay.querySelector('.rm-google-docs-header-bar') as HTMLElement
    expect(activeBar.parentElement).toBe(overlay)
    expect(activeBar.style.getPropertyValue('--rm-header-bar-width')).toBe('800px')
    expect(activeBar.style.getPropertyValue('--rm-header-bar-padding-left')).toBe('39px')
    expect(activeBar.style.getPropertyValue('--rm-header-bar-padding-right')).toBe('77px')

    const input = overlay.querySelector('.rm-header-edit-input') as HTMLElement
    input.innerHTML = 'Later page header'
    vm.finishHeaderEdit(true)
    expect(vm.userHeaderLeft).toBe('Later page header')
    expect(document.querySelector('.rm-header-edit-overlay')).toBeNull()
    getComputedStyleSpy.mockRestore()
    wrapper.unmount()
  })

  it('maps later-page headers to their own page slot, never page 1', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      editor?: { view: { dom: HTMLElement } }
      startInlineHeaderEdit: (event?: { target: HTMLElement }) => void
      finishHeaderEdit: (commit?: boolean) => void
      isDifferentOddEven: boolean
      userHeaderLeft: string
      userFirstPageHeaderLeft: string
      userEvenPageHeaderLeft: string
    }
    vm.isDifferentOddEven = true

    // The first `.rm-page-break` header is the page-2 slot (even page).
    const header = vm.editor!.view.dom.querySelector('.rm-page-break .rm-page-header') as HTMLElement | null
    expect(header).not.toBeNull()

    vm.startInlineHeaderEdit({ target: header! })
    const input = document.querySelector('.rm-header-edit-input') as HTMLElement | null
    expect(input).not.toBeNull()
    input!.innerHTML = 'Even page header'
    vm.finishHeaderEdit(true)

    expect(vm.userEvenPageHeaderLeft).toBe('Even page header')
    expect(vm.userHeaderLeft).toBe('')
    expect(vm.userFirstPageHeaderLeft).toBe('')
    wrapper.unmount()
  })

  it('normalizes header/footer cm values on Apply and applies them as px CSS variables', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins, headerMarginCm: 1.3, footerMarginCm: 0.8 },
    })
    await new Promise((resolve) => setTimeout(resolve, 80))

    const vm = wrapper.vm as unknown as {
      editor?: { view: { dom: HTMLElement } }
      headerMarginCm: number
      footerMarginCm: number
      draftHeaderMarginCm: number
      draftFooterMarginCm: number
      openHeaderFormatModal: () => void
      applyHeaderFormat: () => void
    }

    // Dialog drafts initialize from the current persisted values, not 1.27.
    vm.openHeaderFormatModal()
    expect(vm.draftHeaderMarginCm).toBe(1.3)
    expect(vm.draftFooterMarginCm).toBe(0.8)

    // Out-of-range drafts are clamped on Apply.
    vm.draftHeaderMarginCm = -1
    vm.draftFooterMarginCm = 99
    vm.applyHeaderFormat()
    expect(wrapper.emitted('update:header-footer-margins')?.at(-1)).toEqual([{ headerMarginCm: 0, footerMarginCm: 5 }])

    // Non-finite drafts fall back to the default.
    vm.openHeaderFormatModal()
    vm.draftHeaderMarginCm = Number.NaN
    vm.applyHeaderFormat()
    expect(vm.headerMarginCm).toBe(0.5)

    // 0.5cm is converted to px only at the layout boundary (1cm = 37.795px).
    vm.openHeaderFormatModal()
    vm.draftHeaderMarginCm = 0.5
    vm.applyHeaderFormat()
    const cssValue = vm.editor!.view.dom.style.getPropertyValue('--rm-header-margin-top')
    expect(parseFloat(cssValue)).toBeCloseTo(18.8975, 3)

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
    const marginInputs = wrapper.findAll('input[type="number"]')
    const headerInput = marginInputs[0]
    const footerInput = marginInputs[1]
    expect(headerInput.attributes('min')).toBe('0')
    expect(headerInput.attributes('max')).toBe('5')
    expect(headerInput.attributes('step')).toBe('0.1')
    expect(footerInput.attributes('step')).toBe('0.1')

    // Set draft margins (does not touch active headerMarginCm until apply)
    vm.draftHeaderMarginCm = 2.0
    vm.draftFooterMarginCm = 2.0
    expect(vm.headerMarginCm).toBe(0.5)

    vm.applyHeaderFormat()
    await wrapper.vm.$nextTick()

    expect(vm.showHeaderFormatModal).toBe(false)
    expect(wrapper.emitted('update:header-footer-margins')?.at(-1)).toEqual([{ headerMarginCm: 2.0, footerMarginCm: 2.0 }])

    wrapper.unmount()
  })

  it('clamps Page Setup margins to the supported range only on Apply', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      margins: { top: number; bottom: number; left: number; right: number }
      pageSetupMarginsCm: { top: number; bottom: number; left: number; right: number }
      showPageSetupModal: boolean
      openPageSetupModal: () => void
      applyPageSetup: () => void
    }

    vm.openPageSetupModal()
    await wrapper.vm.$nextTick()
    expect(vm.showPageSetupModal).toBe(true)

    vm.pageSetupMarginsCm.top = -20
    vm.pageSetupMarginsCm.bottom = 250
    vm.pageSetupMarginsCm.left = Number.NaN
    vm.pageSetupMarginsCm.right = Number.POSITIVE_INFINITY

    expect(vm.margins).toEqual({ top: 94, bottom: 94, left: 94, right: 94 })

    vm.applyPageSetup()
    await wrapper.vm.$nextTick()

    expect(vm.margins).toEqual({ top: 0, bottom: 189, left: 0, right: 0 })
    expect(vm.showPageSetupModal).toBe(false)
    expect(vm.pageSetupMarginsCm).toEqual({ top: 0, bottom: 5, left: 0, right: 0 })

    wrapper.unmount()
  })

  it('supports Page Number modal settings with draft states (position, start at, hidden pages)', async () => {
    const wrapper = mount(DocsEditor, {
      props: { plugins: defaultPlugins },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      showPageNumberModal: boolean
      pageNumberPosition: 'header' | 'footer'
      hiddenPageNumbers: number[]
      pageNumberStartAt: number
      draftPageNumberPosition: 'header' | 'footer'
      draftHiddenPageList: string
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
    vm.draftHiddenPageList = '1, 3-5'
    vm.draftPageNumberStartAt = 5
    vm.applyPageNumberSettings()
    await wrapper.vm.$nextTick()

    expect(vm.showPageNumberModal).toBe(false)
    expect(vm.pageNumberPosition).toBe('footer')
    expect(vm.userHeaderRight).toBe('')
    expect(vm.userFooterRight).toBe('{page}')
    expect(vm.hiddenPageNumbers).toEqual([1, 3, 4, 5])
    expect(vm.pageNumberStartAt).toBe(5)

    wrapper.unmount()
  })

  // ─── Issue #133 — orphaned comment thread detection ───────────────────────
  // A thread is "orphaned" when it is anchored (anchorIndex != null) but
  // its id no longer appears on any `comment` mark in the current
  // document — i.e. the anchored text was deleted. The state is computed
  // client-side (never persisted) and should not flash orphaned during
  // collab load (the empty-doc guard).

  it('flags a comment thread as orphaned when its anchored text is deleted', async () => {
    const { commentPlugin } = await import('../../../plugins/src/comment')
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [...defaultPlugins, commentPlugin],
        comments: [
          {
            id: 'thread-1',
            authorId: 'u1',
            authorName: 'Alice',
            authorColor: '#f00',
            content: 'Check this',
            anchorText: 'test 2',
            anchorIndex: 6,
            createdAt: Date.now(),
            resolved: false,
            replies: [],
          },
        ],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: {
        commands: {
          focus: () => void
          setContent: (content: object) => boolean
          setTextSelection: (sel: { from: number; to: number }) => boolean
          setMark: (name: string, attrs: Record<string, unknown>) => boolean
        }
        view: { dispatch: (tr: unknown) => void }
        state: { tr: unknown }
      }
    }

    // Seed content + set a `comment` mark on "test 2" — the thread is
    // anchored to that range.
    vm.editor!.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test 1 test 2 test 3' }] }],
    })
    vm.editor!.commands.setTextSelection({ from: 7, to: 13 })
    vm.editor!.commands.setMark('comment', { threadId: 'thread-1', pos: 7 })
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Initially present → not orphaned.
    const notOrphaned = (wrapper.vm as unknown as { orphanedCommentIds: string[] }).orphanedCommentIds
    expect(notOrphaned).not.toContain('thread-1')

    // Reproduce the issue: delete all the text (the mark goes with it).
    // This mirrors the real user flow — selecting + deleting the anchored
    // range is what strands the thread.
    vm.editor!.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] })
    // setContent may not always surface to the `transaction` listener in
    // the test harness — dispatch a bare tr to force the debounced rescan.
    vm.editor!.view.dispatch(vm.editor!.state.tr)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const orphaned = (wrapper.vm as unknown as { orphanedCommentIds: string[] }).orphanedCommentIds
    expect(orphaned).toContain('thread-1')

    wrapper.unmount()
  })

  it('does not flag a comment thread whose mark survives', async () => {
    const { commentPlugin } = await import('../../../plugins/src/comment')
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [...defaultPlugins, commentPlugin],
        comments: [
          {
            id: 'thread-keep',
            authorId: 'u1',
            authorName: 'Alice',
            authorColor: '#f00',
            content: 'Still here',
            anchorText: 'survives',
            anchorIndex: 6,
            createdAt: Date.now(),
            resolved: false,
            replies: [],
          },
        ],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const vm = wrapper.vm as unknown as {
      editor?: {
        commands: {
          focus: () => void
          setContent: (content: object) => boolean
          setTextSelection: (sel: { from: number; to: number }) => boolean
          setMark: (name: string, attrs: Record<string, unknown>) => boolean
        }
      }
    }

    vm.editor!.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'survives stays' }] }],
    })
    vm.editor!.commands.setTextSelection({ from: 1, to: 9 })
    vm.editor!.commands.setMark('comment', { threadId: 'thread-keep', pos: 1 })
    await new Promise((resolve) => setTimeout(resolve, 100))

    const orphaned = (wrapper.vm as unknown as { orphanedCommentIds: string[] }).orphanedCommentIds
    expect(orphaned).not.toContain('thread-keep')

    wrapper.unmount()
  })

  it('never orphans a general comment thread (no anchor)', async () => {
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: defaultPlugins,
        comments: [
          {
            id: 'general-1',
            authorId: 'u1',
            authorName: 'Alice',
            authorColor: '#f00',
            content: 'Doc-wide note',
            // anchorIndex is undefined — a general comment is never
            // anchored, so it can never be orphaned by definition.
            createdAt: Date.now(),
            resolved: false,
            replies: [],
          },
        ],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const orphaned = (wrapper.vm as unknown as { orphanedCommentIds: string[] }).orphanedCommentIds
    expect(orphaned).not.toContain('general-1')

    wrapper.unmount()
  })

  it('defers the first orphan scan until content is present (no collab flash)', async () => {
    // Sanctioned flow (docs/INTEGRATION.md + demo apps): the editor mounts
    // FIRST without collaboration (local mode), then the host hands over the
    // async-built CollaborationSetup when it resolves — useEditor tears down
    // and rebuilds the editor against it (issue fe-aktifai#230).
    const { commentPlugin } = await import('../../../plugins/src/comment')
    const collabSetup = await createCollaboration({
      provider: 'websocket',
      room: 'room-EXP-' + Date.now(),
      websocketUrl: 'ws://127.0.0.1:1/',
      user: { name: 'Alice', color: '#f00' },
    })
    const wrapper = mount(DocsEditor, {
      props: {
        plugins: [...defaultPlugins, commentPlugin],
        comments: [
          {
            id: 'thread-collab',
            authorId: 'u1',
            authorName: 'Alice',
            authorColor: '#f00',
            content: 'Anchored',
            anchorText: 'loaded',
            anchorIndex: 1,
            createdAt: Date.now(),
            resolved: false,
            replies: [],
          },
        ],
      },
    })
    // Wait for the initial (local) editor to settle before rebinding.
    await new Promise((resolve) => setTimeout(resolve, 30))
    await wrapper.setProps({ collaboration: collabSetup })
    // Wait long enough for the debounced scan timer to fire; the doc is still
    // empty (no provider sync in the test harness) — the guard must keep
    // orphanedCommentIds empty.
    await new Promise((resolve) => setTimeout(resolve, 150))

    const before = (wrapper.vm as unknown as { orphanedCommentIds: string[] }).orphanedCommentIds
    expect(before).toEqual([])

    // Requirement (fe-aktifai#230): a brand-new empty collab room must be
    // typeable immediately — the provisional empty-paragraph seed keeps PM and
    // Yjs in agreement, so typing no longer crashes in y-prosemirror's undo
    // plugin (lib0 `unexpectedCase`).
    const vm = wrapper.vm as unknown as {
      editor?: {
        commands: { focus: () => void; insertContent: (text: string) => void }
        getText: () => string
      }
    }
    vm.editor?.commands.insertContent('Halo kosong')
    expect(vm.editor?.getText()).toContain('Halo kosong')

    wrapper.unmount()
  })
})
