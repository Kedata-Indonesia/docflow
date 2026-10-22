import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    // Issue #359 — the confirmation dialog teleports to <body>, so it is
    // queried on the document rather than inside the wrapper.
    attachTo: document.body,
  })
}

function dialogNode(testid: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
}

async function answerDialog(action: 'confirm' | 'cancel'): Promise<void> {
  const button = dialogNode(`confirm-dialog-${action}`)
  expect(button).not.toBeNull()
  button!.click()
  await nextTick()
  await flushPromises()
}

/** The Delete button is the only action with a "Delete" title attribute. */
function deleteButton(wrapper: ReturnType<typeof mountSidebar>) {
  const button = wrapper.findAll('button').find((b) => b.attributes('title') === 'Delete')
  expect(button).toBeDefined()
  return button!
}

afterEach(() => {
  // A test that fails before unmounting would otherwise leak the teleported
  // dialog into the next one.
  document.body.querySelectorAll('[data-testid="confirm-dialog-overlay"]').forEach((el) => el.remove())
})

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

  it('opens the in-app confirmation instead of window.confirm (issue #359)', async () => {
    const onDeleteComment = vi.fn()
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'], onDeleteComment })
    const confirmSpy = vi.spyOn(window, 'confirm')

    await deleteButton(wrapper).trigger('click')

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(dialogNode('confirm-dialog')).not.toBeNull()
    // Nothing is destroyed until the dialog is answered.
    expect(onDeleteComment).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('emits delete-comment when the dialog is confirmed', async () => {
    const onDeleteComment = vi.fn()
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'], onDeleteComment })

    await deleteButton(wrapper).trigger('click')
    await answerDialog('confirm')

    expect(onDeleteComment).toHaveBeenCalledWith('thread-1')
    expect(dialogNode('confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('does not emit delete-comment when the dialog is dismissed', async () => {
    const onDeleteComment = vi.fn()
    const wrapper = mountSidebar({ orphanedIds: ['thread-1'], onDeleteComment })

    await deleteButton(wrapper).trigger('click')
    await answerDialog('cancel')

    expect(onDeleteComment).not.toHaveBeenCalled()
    expect(dialogNode('confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('lets the host dialog decide when confirmDestructive is supplied', async () => {
    const confirmDestructive = vi.fn().mockResolvedValue(true)
    const onDeleteComment = vi.fn()
    const wrapper = mountSidebar({
      orphanedIds: ['thread-1'],
      confirmDestructive,
      onDeleteComment,
    })

    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmDestructive).toHaveBeenCalledWith(
      'Delete this comment thread? This cannot be undone.',
    )
    expect(onDeleteComment).toHaveBeenCalledWith('thread-1')
    // The built-in dialog is never rendered when the host owns one.
    expect(dialogNode('confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('does not emit when the host dialog declines', async () => {
    const confirmDestructive = vi.fn().mockResolvedValue(false)
    const onDeleteComment = vi.fn()
    const wrapper = mountSidebar({
      orphanedIds: ['thread-1'],
      confirmDestructive,
      onDeleteComment,
    })

    await deleteButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmDestructive).toHaveBeenCalledOnce()
    expect(onDeleteComment).not.toHaveBeenCalled()
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