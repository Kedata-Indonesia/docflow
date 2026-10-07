import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { getPageSize } from '@kedata-indonesia/docflow-layout-engine'
import DocsEditor from '../components/DocsEditor.vue'
import { useEditor } from '../composables/useEditor.js'

/** `max-width` of the paper wrapper — derived from `resolvedLayoutOptions`. */
const paperWidth = (wrapper: VueWrapper): string =>
  (wrapper.find('.docs-editor__paper').element.parentElement as HTMLElement).style.maxWidth

/** The ProseMirror root element — re-creating the editor replaces this node. */
const proseMirror = (wrapper: VueWrapper): HTMLElement =>
  wrapper.find('.docs-editor__paper .ProseMirror').element as HTMLElement

/** `contenteditable` attribute of the ProseMirror root mounted inside the paper. */
const contentEditable = (wrapper: VueWrapper): string | undefined =>
  wrapper.find('.docs-editor__paper .ProseMirror').attributes('contenteditable')

/**
 * Page width the pagination plugin laid out for, read from the inline CSS
 * variables `PaginationPlus` writes on the ProseMirror root — i.e. the real
 * reflow path, not just the paper wrapper's styling.
 */
const paginatedWidth = (wrapper: VueWrapper): number => {
  const style = proseMirror(wrapper).getAttribute('style') ?? ''
  return Number(/--rm-page-width:\s*([\d.]+)px/.exec(style)?.[1] ?? Number.NaN)
}

const pageWidthOf = (id: string): number => getPageSize(id)?.pageWidth ?? 0

describe('DocsEditor reactive props', () => {
  it('re-lays out the paper when the pageSize prop changes', async () => {
    const wrapper = mount(DocsEditor, { props: { pageSize: 'a4' } })
    try {
      await nextTick()
      expect(paperWidth(wrapper)).toBe(`${pageWidthOf('a4')}px`)

      const mountTimePaper = proseMirror(wrapper)
      await wrapper.setProps({ pageSize: 'f4' })
      await nextTick()
      expect(paperWidth(wrapper)).toBe(`${pageWidthOf('f4')}px`)
      expect(paginatedWidth(wrapper)).toBe(pageWidthOf('f4'))
      // Re-laid out, never re-created: the editor instance has to survive.
      expect(proseMirror(wrapper)).toBe(mountTimePaper)

      await wrapper.setProps({ pageSize: 'a4' })
      await nextTick()
      expect(paperWidth(wrapper)).toBe(`${pageWidthOf('a4')}px`)
      expect(paginatedWidth(wrapper)).toBe(pageWidthOf('a4'))
      expect(proseMirror(wrapper)).toBe(mountTimePaper)
    } finally {
      wrapper.unmount()
    }
  })

  it('toggles the ProseMirror editable state when the editable prop changes', async () => {
    const wrapper = mount(DocsEditor, { props: { editable: true } })
    try {
      await nextTick()
      expect(contentEditable(wrapper)).toBe('true')

      await wrapper.setProps({ editable: false })
      await nextTick()
      expect(contentEditable(wrapper)).toBe('false')

      await wrapper.setProps({ editable: true })
      await nextTick()
      expect(contentEditable(wrapper)).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })
})

describe('useEditor editable option', () => {
  it('follows a ref after the editor is mounted', async () => {
    const editable = ref(true)
    let captured: ReturnType<typeof useEditor> | null = null

    const TestComponent = defineComponent({
      setup() {
        const instance = useEditor({ editable })
        captured = instance
        return () => h('div', { ref: instance.editorRef })
      },
    })

    const wrapper = mount(TestComponent)
    try {
      await nextTick()
      expect(captured!.editor.value?.isEditable).toBe(true)

      editable.value = false
      await nextTick()
      expect(captured!.editor.value?.isEditable).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})
