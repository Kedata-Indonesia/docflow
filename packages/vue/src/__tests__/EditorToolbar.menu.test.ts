import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEditor, type DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import EditorToolbar from '../components/EditorToolbar.vue'
import { defaultLocale, getLocaleMessages } from '../locales/index.js'

// The toolbar renders its own labels from the locale context (see useLocale);
// derive the aria-label instead of hardcoding a translation.
const toolbarMessages = getLocaleMessages(defaultLocale).toolbar as Record<string, string>

const plugins: DocsEditorPlugin[] = [
  {
    id: 'link',
    toolbar: [{ id: 'link', label: 'Link', action: 'setLink' }],
  },
  {
    id: 'toc',
    toolbar: [
      { id: 'insert-toc', label: 'Generate Daftar Isi', action: 'generateToc', menu: 'insert' },
    ],
  },
]

// The dropdown trigger is disabled while `editor` is null, so the toolbar needs
// a real editor instance to be interactive.
let setup: ReturnType<typeof createEditor>

beforeEach(() => {
  const target = document.createElement('div')
  document.body.appendChild(target)
  setup = createEditor({ target, plugins })
})

afterEach(() => {
  setup.destroy()
  setup.editor.view.dom.parentElement?.remove()
})

function mountToolbar(props: Record<string, unknown> = {}) {
  return mount(EditorToolbar, {
    props: { actions: {}, plugins, editor: setup.editor, ...props },
  })
}

/** The "+" (Sisipkan) dropdown panel — several dropdowns share this class. */
function insertDropdown(wrapper: ReturnType<typeof mountToolbar>) {
  const trigger = wrapper.find(`[title="${toolbarMessages.insert}"]`)
  expect(trigger.exists()).toBe(true)
  return { trigger, panel: trigger.element.parentElement as HTMLElement }
}

describe('EditorToolbar — insert (+) menu extension point', () => {
  it('renders built-in insert actions and menu-opted plugin items inside the + dropdown', async () => {
    const wrapper = mountToolbar()
    const { trigger, panel } = insertDropdown(wrapper)

    // Closed by default — menu items must not leak into the flat toolbar.
    expect(wrapper.text()).not.toContain('Generate Daftar Isi')

    await trigger.trigger('click')

    const labels = Array.from(panel.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '')
    expect(labels).toContain('Generate Daftar Isi')
  })

  it('does not render a menu-opted item as a flat toolbar button', () => {
    const wrapper = mountToolbar()
    const flatButtons = wrapper.findAll('button').filter((b) => b.text() === 'Generate Daftar Isi')
    expect(flatButtons).toHaveLength(0)
  })
})

describe('EditorToolbar — showHistory', () => {
  it('shows the built-in history toggle by default', () => {
    const wrapper = mountToolbar()
    expect(wrapper.find(`[aria-label="${toolbarMessages.history}"]`).exists()).toBe(true)
  })

  it('hides the built-in history toggle when showHistory is false', () => {
    const wrapper = mountToolbar({ showHistory: false })
    expect(wrapper.find(`[aria-label="${toolbarMessages.history}"]`).exists()).toBe(false)
  })
})
