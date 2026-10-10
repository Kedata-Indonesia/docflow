import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SuggestionsSidebar from '../components/sidebars/SuggestionsSidebar.vue'
import type { SuggestionSummary } from '../types.js'

const suggestions: SuggestionSummary[] = [
  { id: 's1', type: 'insert', authorId: 'u1', authorName: 'Alice', from: 1, to: 4 },
  { id: 's2', type: 'delete', authorId: 'u2', authorName: 'Bob', from: 6, to: 7 },
]

function mountSidebar(props: Record<string, unknown> = {}) {
  return mount(SuggestionsSidebar, {
    props: { suggestions, ...props },
  })
}

describe('SuggestionsSidebar (#27/#28 P2)', () => {
  it('lists suggestions with author + type, and the count', () => {
    const text = mountSidebar().text()
    expect(text).toContain('Alice')
    expect(text).toContain('Bob')
    expect(text).toContain('Insert')
    expect(text).toContain('Delete')
    expect(text).toContain('2 pending suggestion')
  })

  it('emits accept/reject per suggestion', async () => {
    const wrapper = mountSidebar()
    const acceptButtons = wrapper.findAll('button').filter((b) => b.text().trim() === 'Accept')
    const rejectButtons = wrapper.findAll('button').filter((b) => b.text().trim() === 'Reject')
    await acceptButtons[0].trigger('click')
    await rejectButtons[1].trigger('click')
    expect(wrapper.emitted('accept')?.[0]).toEqual(['s1'])
    expect(wrapper.emitted('reject')?.[0]).toEqual(['s2'])
  })

  it('emits accept-all / reject-all', async () => {
    const wrapper = mountSidebar()
    const acceptAll = wrapper.findAll('button').find((b) => b.text().includes('Accept all'))!
    const rejectAll = wrapper.findAll('button').find((b) => b.text().includes('Reject all'))!
    await acceptAll.trigger('click')
    await rejectAll.trigger('click')
    expect(wrapper.emitted('accept-all')).toHaveLength(1)
    expect(wrapper.emitted('reject-all')).toHaveLength(1)
  })

  it('shows an empty state with no suggestions', () => {
    const wrapper = mountSidebar({ suggestions: [] })
    expect(wrapper.text()).toContain('No pending suggestions')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Accept all'))).toBe(false)
  })

  it('hides accept/reject controls when the host cannot review', () => {
    const wrapper = mountSidebar({ canReview: false })
    const labels = wrapper.findAll('button').map((b) => b.text().trim())
    expect(labels).not.toContain('Accept')
    expect(labels.some((l) => l.includes('Accept all'))).toBe(false)
    // the list is still visible
    expect(wrapper.text()).toContain('Alice')
  })
})
