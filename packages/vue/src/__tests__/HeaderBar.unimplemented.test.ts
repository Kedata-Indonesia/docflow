import { nextTick } from 'vue'
import { mount, type DOMWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DocsEditor from '../components/DocsEditor.vue'
import HeaderBar from '../components/HeaderBar.vue'

/**
 * Issue #153 — host-owned header menu items.
 *
 * The contract: a flagged item stays VISIBLE (never hidden), is dimmed +
 * annotated (`aria-disabled`, `title`, a visible chip) and STILL emits when
 * clicked, so a host can watch the port fire in its own log.
 */
const DEFAULT_REASON =
  'Host-owned action — the editor emits the event and the host app implements it.'

const mountHeader = (props: Record<string, unknown> = {}) =>
  mount(HeaderBar, { props: { title: 'Project Brief', ...props }, attachTo: document.body })

/** The chip repeats the flag next to the label — strip it before matching. */
const labelOf = (button: DOMWrapper<Element>): string =>
  button.text().replace(/\bhost\b/gi, '').replace(/\s+/g, ' ').trim()

const findItem = (wrapper: ReturnType<typeof mountHeader>, label: string): DOMWrapper<Element> => {
  const button = wrapper.findAll('nav button').find((candidate) => labelOf(candidate) === label)
  if (!button) throw new Error(`menu item not found in the open File menu: ${label}`)
  return button
}

/** Mounts the bar with the File menu open (all the flagged items live there). */
const openFileMenu = async (props: Record<string, unknown> = {}) => {
  const wrapper = mountHeader(props)
  const fileButton = wrapper.findAll('nav button').find((candidate) => candidate.text().trim() === 'File')
  if (!fileButton) throw new Error('File menu button not found')
  await fileButton.trigger('click')
  await nextTick()
  return wrapper
}

describe('HeaderBar host-owned items (#153)', () => {
  const unimplementedActions = ['trash', { action: 'move', reason: 'The host owns document moves.' }]

  it('dims a bare-string action, keeps it visible and still emits on click', async () => {
    const wrapper = await openFileMenu({ unimplementedActions })
    const trash = findItem(wrapper, 'Move to trash')

    // Visible, not hidden.
    expect(trash.exists()).toBe(true)
    expect(trash.isVisible()).toBe(true)
    // Dimmed + annotated (never colour alone: the chip is in the text).
    expect(trash.attributes('aria-disabled')).toBe('true')
    expect(trash.classes()).toContain('opacity-50')
    expect(trash.classes()).not.toContain('hover:bg-slate-50')
    expect(trash.attributes('title')).toBe(DEFAULT_REASON)
    expect(trash.text()).toContain('host')

    // The click still fires — the event log is the point.
    await trash.trigger('click')
    expect(wrapper.emitted('menu-click')?.[0]).toEqual(['trash'])

    wrapper.unmount()
  })

  it('shows the host-provided reason as the tooltip', async () => {
    const wrapper = await openFileMenu({ unimplementedActions })
    const move = findItem(wrapper, 'Move')

    expect(move.attributes('aria-disabled')).toBe('true')
    expect(move.classes()).toContain('opacity-50')
    expect(move.attributes('title')).toBe('The host owns document moves.')

    await move.trigger('click')
    expect(wrapper.emitted('menu-click')?.[0]).toEqual(['move'])

    wrapper.unmount()
  })

  it('leaves items that are not in the list untouched', async () => {
    const wrapper = await openFileMenu({ unimplementedActions })
    const print = findItem(wrapper, 'Print')

    expect(print.attributes('aria-disabled')).toBeUndefined()
    expect(print.attributes('title')).toBeUndefined()
    expect(print.classes()).not.toContain('opacity-50')
    expect(print.classes()).toContain('hover:bg-slate-50')
    expect(print.text()).not.toContain('host')

    await print.trigger('click')
    expect(wrapper.emitted('menu-click')?.[0]).toEqual(['print'])

    wrapper.unmount()
  })

  it('applies the same rules to sub-items (Download ▸ DOCX)', async () => {
    const wrapper = await openFileMenu({ unimplementedActions: ['export:docx'] })
    const download = findItem(wrapper, 'Download')

    // The sub-panel opens on the row's mouseenter (see HeaderBar template).
    download.element.parentElement?.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()

    const docx = wrapper.findAll('nav button').find((candidate) => candidate.text().includes('Microsoft Word'))
    expect(docx).toBeDefined()
    expect(docx!.attributes('aria-disabled')).toBe('true')
    expect(docx!.classes()).toContain('opacity-50')
    expect(docx!.attributes('title')).toBe(DEFAULT_REASON)
    expect(docx!.text()).toContain('host')

    await docx!.trigger('click')
    expect(wrapper.emitted('export')?.[0]).toEqual(['docx'])

    wrapper.unmount()
  })

  it('renders nothing host-owned when the prop is omitted (docflow-app path)', async () => {
    const wrapper = await openFileMenu()

    expect(wrapper.findAll('nav button').some((candidate) => candidate.text().includes('host'))).toBe(false)
    expect(wrapper.findAll('nav [aria-disabled="true"]')).toHaveLength(0)
    expect(wrapper.find('nav button[title="' + DEFAULT_REASON + '"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('threads the prop from DocsEditor down to HeaderBar', async () => {
    const wrapper = mount(DocsEditor, { props: { unimplementedActions: ['trash'] } })
    // The editor is created asynchronously — wait for the first tick (see the
    // mount-only pitfall in the repo notes).
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(wrapper.findComponent(HeaderBar).props('unimplementedActions')).toEqual(['trash'])

    wrapper.unmount()
  })
})
