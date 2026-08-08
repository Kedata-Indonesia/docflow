import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { CommentItem } from '../types.js'
import CommentsSidebar from '../components/sidebars/CommentsSidebar.vue'

function makeComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
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
    ...overrides,
  }
}

function mountSidebar(props: Record<string, unknown> = {}) {
  return mount(CommentsSidebar, {
    props: {
      comments: [makeComment()],
      selectedTextSnippet: '',
      selectedTextIndex: undefined,
      ...props,
    },
  })
}

describe('CommentsSidebar — orphaned threads (issue #133)', () => {
  it('renders the "text deleted" badge for ids in orphanedIds', () => {
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'] })
    // The amber badge carries the localized "Text deleted" label.
    expect(wrapper.text()).toContain('Text deleted')
    // The quote block switches to the struck-through amber variant.
    const quote = wrapper.find('[class*="line-through"]')
    expect(quote.exists()).toBe(true)
    expect(quote.text()).toContain('test 2')
    wrapper.unmount()
  })

  it('does not render the badge for non-orphaned threads', () => {
    const wrapper = mountSidebar({ orphanedIds: [] })
    expect(wrapper.text()).not.toContain('Text deleted')
    // No struck-through quote for a present anchor.
    expect(wrapper.find('[class*="line-through"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits delete-comment when the Delete button is clicked (confirm accepted)', async () => {
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'] })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    // The Delete button is the only button with a Trash2 icon; in the
    // rendered DOM it's the second action button (after Resolve). We
    // target it by its localized title attribute.
    const deleteBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'Delete')
    expect(deleteBtn).toBeDefined()
    await deleteBtn!.trigger('click')

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(wrapper.emitted('delete-comment')?.[0]).toEqual(['thread-1'])

    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('does not emit delete-comment when the confirm dialog is dismissed', async () => {
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'] })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    const deleteBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'Delete')
    expect(deleteBtn).toBeDefined()
    await deleteBtn!.trigger('click')

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(wrapper.emitted('delete-comment')).toBeUndefined()

    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('does not show the Delete button for non-orphaned threads', () => {
    const wrapper = mountSidebar({ orphanedIds: [] })
    const deleteBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'Delete')
    expect(deleteBtn).toBeUndefined()
    wrapper.unmount()
  })

  it('still renders the Resolve button for orphaned threads', () => {
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'] })
    const resolveBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'Resolve')
    expect(resolveBtn).toBeDefined()
    wrapper.unmount()
  })
})