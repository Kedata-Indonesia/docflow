import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h, type Component } from 'vue'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import DocsEditor from '../components/DocsEditor.vue'
import ReferencesSidebar from '../components/sidebars/ReferencesSidebar.vue'
import CommentsSidebar from '../components/sidebars/CommentsSidebar.vue'
import HistorySidebar from '../components/sidebars/HistorySidebar.vue'
import AISidebar from '../components/sidebars/AISidebar.vue'
import type { DocumentSnapshot } from '../types.js'

/**
 * Guards the `DocsEditor` ↔ `DocsEditorSidebars` bridge introduced by the
 * sidebar extraction: the child re-emits every sidebar intent, and `DocsEditor`
 * either forwards it to the host (`$emit`) or routes it into its own
 * reference-library state. `DocsEditor.test.ts` only drives the TOC sidebar,
 * which lives in the parent, so these paths had no runtime coverage.
 */

type DocsEditorVm = {
  activeSidebar: string | null
  citationSources: CslItemData[]
  citationStyleId: string
}

const SIDEBAR_BY_KEY: Record<string, Component> = {
  references: ReferencesSidebar,
  comments: CommentsSidebar,
  ai: AISidebar,
}

const mountEditor = async (citation?: { sources: CslItemData[]; style: string }) => {
  const wrapper = mount(DocsEditor, citation ? { props: { citation } } : {})
  await new Promise((resolve) => setTimeout(resolve, 50))
  return { wrapper, vm: wrapper.vm as unknown as DocsEditorVm }
}

const openSidebar = async (key: string) => {
  const mounted = await mountEditor()
  mounted.vm.activeSidebar = key
  await mounted.wrapper.vm.$nextTick()
  return mounted
}

describe('DocsEditor sidebar bridge', () => {
  it('forwards comment events from the comments sidebar', async () => {
    const { wrapper } = await openSidebar('comments')
    const sidebar = wrapper.findComponent(CommentsSidebar)
    expect(sidebar.exists()).toBe(true)

    sidebar.vm.$emit('add-comment', 'hello', 'anchor', 3)
    sidebar.vm.$emit('add-reply', 'c1', 'reply')
    sidebar.vm.$emit('resolve-comment', 'c1')
    sidebar.vm.$emit('delete-comment', 'c1')

    expect(wrapper.emitted('add-comment')?.[0]).toEqual(['hello', 'anchor', 3])
    expect(wrapper.emitted('add-reply')?.[0]).toEqual(['c1', 'reply'])
    expect(wrapper.emitted('resolve-comment')?.[0]).toEqual(['c1'])
    expect(wrapper.emitted('delete-comment')?.[0]).toEqual(['c1'])

    wrapper.unmount()
  })

  it('forwards history events from the history sidebar', async () => {
    const { wrapper } = await openSidebar('history')
    const sidebar = wrapper.findComponent(HistorySidebar)
    expect(sidebar.exists()).toBe(true)

    const snapshot: DocumentSnapshot = {
      versionId: 'v1',
      versionIndex: 0,
      title: 'Version 1',
      contentPreview: 'Hello',
      modifiedBy: 'Alice',
      timestamp: 1,
    }
    sidebar.vm.$emit('save-snapshot', 'v1')
    sidebar.vm.$emit('restore-snapshot', 2)
    sidebar.vm.$emit('preview-snapshot', snapshot)

    expect(wrapper.emitted('save-snapshot')?.[0]).toEqual(['v1'])
    expect(wrapper.emitted('restore-snapshot')?.[0]).toEqual([2])
    expect(wrapper.emitted('preview-snapshot')?.[0]).toEqual([snapshot])

    wrapper.unmount()
  })

  it('routes reference-library events into the citation state', async () => {
    const existing: CslItemData = { id: 's1', type: 'book', title: 'Existing' }
    const { wrapper, vm } = await mountEditor({
      sources: [existing],
      style: 'chicago-notes-bibliography',
    })
    vm.activeSidebar = 'references'
    await wrapper.vm.$nextTick()
    const sidebar = wrapper.findComponent(ReferencesSidebar)
    expect(sidebar.exists()).toBe(true)

    const created: CslItemData = { id: 's2', type: 'article-journal', title: 'New' }
    sidebar.vm.$emit('create', created)
    expect(vm.citationSources.map((source) => source.id)).toEqual(['s1', 's2'])

    sidebar.vm.$emit('update:style', 'apa')
    expect(vm.citationStyleId).toBe('apa')

    sidebar.vm.$emit('remove', 's1')
    expect(vm.citationSources.map((source) => source.id)).toEqual(['s2'])

    wrapper.unmount()
  })

  it('closes the open sidebar when the child emits close', async () => {
    for (const key of Object.keys(SIDEBAR_BY_KEY)) {
      const { wrapper, vm } = await openSidebar(key)
      wrapper.findComponent(SIDEBAR_BY_KEY[key]).vm.$emit('close')
      await wrapper.vm.$nextTick()
      expect(vm.activeSidebar).toBeNull()
      wrapper.unmount()
    }
  })

  it('renders no sidebar when none is active', async () => {
    const { wrapper } = await mountEditor()
    expect(wrapper.findComponent(ReferencesSidebar).exists()).toBe(false)
    expect(wrapper.findComponent(CommentsSidebar).exists()).toBe(false)
    expect(wrapper.findComponent(HistorySidebar).exists()).toBe(false)
    expect(wrapper.findComponent(AISidebar).exists()).toBe(false)
    wrapper.unmount()
  })

  // ─── #22: host-supplied references sidebar ─────────────────────────────────
  describe('#references-sidebar slot', () => {
    const mountWithSlot = async (slot: unknown, citation?: { sources: CslItemData[]; style: string }) => {
      const wrapper = mount(DocsEditor, {
        ...(citation ? { props: { citation } } : {}),
        slots: { 'references-sidebar': slot as never },
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      const vm = wrapper.vm as unknown as DocsEditorVm
      vm.activeSidebar = 'references'
      await wrapper.vm.$nextTick()
      return { wrapper, vm }
    }

    it('replaces the built-in sidebar when the host provides the slot', async () => {
      const { wrapper } = await mountWithSlot(`<div class="custom-picker">KB picker</div>`)
      expect(wrapper.find('.custom-picker').exists()).toBe(true)
      expect(wrapper.findComponent(ReferencesSidebar).exists()).toBe(false)
      wrapper.unmount()
    })

    it('falls back to the built-in sidebar when the slot is absent', async () => {
      const { wrapper } = await openSidebar('references')
      expect(wrapper.findComponent(ReferencesSidebar).exists()).toBe(true)
      wrapper.unmount()
    })

    it('passes the live library, picker state and actions to the slot', async () => {
      let slotProps: Record<string, unknown> | undefined
      const existing: CslItemData = { id: 's1', type: 'book', title: 'Existing' }
      const { wrapper, vm } = await mountWithSlot(
        (props: Record<string, unknown>) => {
          slotProps = props
          return h('div', { class: 'custom-picker' })
        },
        { sources: [existing], style: 'apa' },
      )

      expect(slotProps?.activeStyle).toBe('apa')
      expect((slotProps?.sources as CslItemData[])?.map((s) => s.id)).toEqual(['s1'])
      expect(slotProps?.pickerMode).toBe(false)
      for (const action of ['onInsert', 'onClose', 'onCreate', 'onRemove', 'onStyleChange']) {
        expect(typeof slotProps?.[action]).toBe('function')
      }

      // onClose routes back through DocsEditor and clears the active sidebar.
      ;(slotProps?.onClose as () => void)()
      await wrapper.vm.$nextTick()
      expect(vm.activeSidebar).toBeNull()
      wrapper.unmount()
    })
  })
})
