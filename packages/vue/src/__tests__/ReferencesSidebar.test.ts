import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import ReferencesSidebar from '../components/sidebars/ReferencesSidebar.vue'

const bookDoe: CslItemData = {
  id: 'doe-2020',
  type: 'book',
  title: 'The Design of Tests',
  author: [{ family: 'Doe', given: 'John' }],
  issued: { 'date-parts': [[2020]] },
  publisher: 'Test Press',
}

const articleSmith: CslItemData = {
  id: 'smith-2021',
  type: 'article-journal',
  title: 'Citation Systems',
  author: [{ family: 'Smith', given: 'Jane' }],
  issued: { 'date-parts': [[2021]] },
  'container-title': 'Journal of Testing',
}

function mountSidebar(props: Record<string, unknown> = {}) {
  return mount(ReferencesSidebar, {
    props: {
      sources: [bookDoe, articleSmith],
      activeStyle: 'chicago-notes-bibliography',
      ...props,
    },
  })
}

describe('ReferencesSidebar', () => {
  it('lists sources with author, year, and type badge', () => {
    const wrapper = mountSidebar()
    const text = wrapper.text()
    expect(text).toContain('The Design of Tests')
    expect(text).toContain('Doe (2020)')
    expect(text).toContain('Journal of Testing')
    expect(text).toContain('Book')
    expect(text).toContain('Journal article')
    wrapper.unmount()
  })

  it('filters sources by search query', async () => {
    const wrapper = mountSidebar()
    const search = wrapper.find('input[type="text"]')
    await search.setValue('smith')
    expect(wrapper.text()).toContain('Citation Systems')
    expect(wrapper.text()).not.toContain('The Design of Tests')
    wrapper.unmount()
  })

  it('emits insert with the source id when Cite is clicked', async () => {
    const wrapper = mountSidebar()
    const citeButtons = wrapper.findAll('button').filter((b) => b.text().includes('Cite'))
    expect(citeButtons.length).toBe(2)
    await citeButtons[0].trigger('click')
    expect(wrapper.emitted('insert')?.[0]).toEqual(['doe-2020'])
    wrapper.unmount()
  })

  it('emits update:style when the style selector changes', async () => {
    const wrapper = mountSidebar()
    const select = wrapper.find('select')
    await select.setValue('apa')
    expect(wrapper.emitted('update:style')?.[0]).toEqual(['apa'])
    wrapper.unmount()
  })

  it('offers the .csl style import without host import ports', () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('[data-testid="citation-style-import-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="citation-style-import-input"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('emits import-style with the file text and name', async () => {
    const csl = [
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" id="custom">',
      '<info><title>Custom</title></info>',
      '<citation><layout><text variable="title"/></layout></citation>',
      '</style>',
    ].join('')
    const wrapper = mountSidebar()
    const input = wrapper.find('[data-testid="citation-style-import-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File([csl], 'custom.csl', { type: 'application/xml' })],
      configurable: true,
    })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.emitted('import-style')?.[0]).toEqual([{ text: csl, filename: 'custom.csl' }])
    wrapper.unmount()
  })

  it('renders the style import message', () => {
    const wrapper = mountSidebar({ styleImportMessage: 'Style "Custom" imported.' })
    expect(wrapper.get('[data-testid="citation-style-import-message"]').text()).toBe(
      'Style "Custom" imported.',
    )
    wrapper.unmount()
  })

  it('creates a valid CSL-JSON source from the form', async () => {
    const wrapper = mountSidebar({ sources: [] })

    // Open the form via the empty-state "Add source" button.
    const addButtons = wrapper.findAll('button').filter((b) => b.text().includes('Add source'))
    await addButtons[0].trigger('click')

    // Title is required — submit stays disabled without it.
    const submit = wrapper.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    const titleInput = wrapper.find('form input[required]')
    await titleInput.setValue('New Handbook')
    const yearInput = wrapper.find('input[type="number"]')
    await yearInput.setValue('2024')

    await wrapper.find('form').trigger('submit.prevent')

    const created = wrapper.emitted('create')
    expect(created).toHaveLength(1)
    const source = created![0][0] as CslItemData
    expect(source.type).toBe('book')
    expect(source.title).toBe('New Handbook')
    expect(source.issued).toEqual({ 'date-parts': [[2024]] })
    expect(source.id).toBeTruthy()
    wrapper.unmount()
  })

  // Issue #353 — the picker used to accept only .bib/.ris and labelled every
  // other file as BibTeX.
  it('accepts every supported reference file in the picker', async () => {
    const wrapper = mountSidebar({ canImport: true })
    await wrapper.get('[data-testid="import-toggle"]').trigger('click')
    const accept = wrapper.get('[data-testid="import-file-input"]').attributes('accept') ?? ''
    for (const extension of ['.bib', '.ris', '.enw', '.json', '.yaml', '.yml', '.xml']) {
      expect(accept).toContain(extension)
    }
    wrapper.unmount()
  })

  it('detects the format of a picked EndNote file', async () => {
    const wrapper = mountSidebar({ canImport: true })
    await wrapper.get('[data-testid="import-toggle"]').trigger('click')
    const text = '%0 Journal Article\n%T Imported EndNote Title\n'
    const input = wrapper.get('[data-testid="import-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File([text], 'library.enw')],
      configurable: true,
    })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.emitted('import-bibliography')?.[0]).toEqual([{ format: 'enw', text }])
    wrapper.unmount()
  })

  it('labels a .json file as CSL-JSON, not BibTeX', async () => {
    const wrapper = mountSidebar({ canImport: true })
    await wrapper.get('[data-testid="import-toggle"]').trigger('click')
    const text = '[{"type":"book","title":"CSL JSON"}]'
    const input = wrapper.get('[data-testid="import-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File([text], 'export.json')],
      configurable: true,
    })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.emitted('import-bibliography')?.[0]).toEqual([{ format: 'csl-json', text }])
    wrapper.unmount()
  })

  it('reports an unsupported file instead of sending it to the host', async () => {
    const wrapper = mountSidebar({ canImport: true })
    await wrapper.get('[data-testid="import-toggle"]').trigger('click')
    const input = wrapper.get('[data-testid="import-file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['just prose about references'], 'notes.txt')],
      configurable: true,
    })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.emitted('import-bibliography')).toBeUndefined()
    expect(wrapper.get('[data-testid="import-file-error"]').text()).toMatch(/Unsupported file/i)
    wrapper.unmount()
  })

  it('prefills the form when editing an existing source', async () => {
    const wrapper = mountSidebar()
    const editButtons = wrapper.findAll('button[title="Edit"]')
    await editButtons[0].trigger('click')

    const titleInput = wrapper.find('form input[required]')
    expect((titleInput.element as HTMLInputElement).value).toBe('The Design of Tests')

    const titleInput2 = wrapper.find('form input[required]')
    await titleInput2.setValue('The Design of Tests, 2nd ed.')
    await wrapper.find('form').trigger('submit.prevent')

    const updated = wrapper.emitted('update')
    expect(updated).toHaveLength(1)
    const source = updated![0][0] as CslItemData
    expect(source.id).toBe('doe-2020') // edit preserves the id
    expect(source.title).toBe('The Design of Tests, 2nd ed.')
    expect(source.publisher).toBe('Test Press')
    wrapper.unmount()
  })
})

/**
 * Issue #361 — the user can delete a style they imported. The remove control is
 * offered only for the active style, and only when it is not one of the four
 * the library bundles.
 */
describe('ReferencesSidebar — removing imported styles (#361)', () => {
  const HOUSE_ID = 'https://contoh.ac.id/styles/house'
  const styles = [
    { id: 'chicago-notes-bibliography', name: 'Chicago', removable: false },
    { id: 'apa', name: 'APA', removable: false },
    { id: HOUSE_ID, name: 'House style', removable: true },
  ]

  const removeButton = (wrapper: ReturnType<typeof mountSidebar>) =>
    wrapper.find('[data-testid="citation-style-remove-button"]')

  it('offers no remove control for a bundled style', () => {
    const wrapper = mountSidebar({ availableStyles: styles, activeStyle: 'apa' })

    expect(removeButton(wrapper).exists()).toBe(false)
    wrapper.unmount()
  })

  it('offers a remove control when the active style was imported', async () => {
    const onRemoveStyle = vi.fn()
    const wrapper = mountSidebar({
      availableStyles: styles,
      activeStyle: HOUSE_ID,
      onRemoveStyle,
    })

    const button = removeButton(wrapper)
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('Remove this imported style')

    await button.trigger('click')
    expect(onRemoveStyle).toHaveBeenCalledWith(HOUSE_ID)
    wrapper.unmount()
  })

  it('hides the control while a bundled style is selected, even if an import exists', () => {
    const wrapper = mountSidebar({ availableStyles: styles, activeStyle: 'chicago-notes-bibliography' })

    expect(removeButton(wrapper).exists()).toBe(false)
    wrapper.unmount()
  })

  it('lists the imported style alongside the bundled ones', () => {
    const wrapper = mountSidebar({ availableStyles: styles, activeStyle: 'apa' })

    expect(wrapper.findAll('select option').map((o) => o.text())).toEqual([
      'Chicago',
      'APA',
      'House style',
    ])
    wrapper.unmount()
  })
})

/**
 * Issue #359 — deleting a source used `window.confirm`; it now goes through
 * the in-app dialog, and a host that owns a dialog can answer for us.
 *
 * The dialog teleports to <body>, so it is queried on the document. Emits are
 * asserted with listener spies: the pinned @vue/test-utils does not record
 * emits with this Vue version.
 */
describe('ReferencesSidebar — delete confirmation (issue #359)', () => {
  function mountAttached(props: Record<string, unknown> = {}) {
    return mount(ReferencesSidebar, {
      props: {
        sources: [bookDoe, articleSmith],
        activeStyle: 'chicago-notes-bibliography',
        ...props,
      },
      attachTo: document.body,
    })
  }

  function dialogNode(testid: string): HTMLElement | null {
    return document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
  }

  function deleteButtons(wrapper: ReturnType<typeof mountAttached>) {
    return wrapper.findAll('button[title="Delete"]')
  }

  async function answerDialog(action: 'confirm' | 'cancel'): Promise<void> {
    const button = dialogNode(`confirm-dialog-${action}`)
    expect(button).not.toBeNull()
    button!.click()
    await nextTick()
    await flushPromises()
  }

  afterEach(() => {
    document.body
      .querySelectorAll('[data-testid="confirm-dialog-overlay"]')
      .forEach((el) => el.remove())
  })

  it('asks with the in-app dialog instead of window.confirm', async () => {
    const onRemove = vi.fn()
    const wrapper = mountAttached({ onRemove })
    const confirmSpy = vi.spyOn(window, 'confirm')

    await deleteButtons(wrapper)[0].trigger('click')

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(dialogNode('confirm-dialog')).not.toBeNull()
    // The message names the source and the consequence.
    expect(dialogNode('confirm-dialog-message')?.textContent).toContain('The Design of Tests')
    expect(dialogNode('confirm-dialog-message')?.textContent).toContain('stop rendering')
    expect(onRemove).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
    wrapper.unmount()
  })

  it('removes the source only after the dialog is confirmed', async () => {
    const onRemove = vi.fn()
    const wrapper = mountAttached({ onRemove })

    await deleteButtons(wrapper)[0].trigger('click')
    await answerDialog('confirm')

    expect(onRemove).toHaveBeenCalledWith('doe-2020')
    expect(dialogNode('confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the source when the dialog is cancelled', async () => {
    const onRemove = vi.fn()
    const wrapper = mountAttached({ onRemove })

    await deleteButtons(wrapper)[0].trigger('click')
    await answerDialog('cancel')

    expect(onRemove).not.toHaveBeenCalled()
    expect(dialogNode('confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('lets the host dialog decide when confirmDestructive is supplied', async () => {
    const confirmDestructive = vi.fn().mockResolvedValue(true)
    const onRemove = vi.fn()
    const wrapper = mountAttached({ confirmDestructive, onRemove })

    await deleteButtons(wrapper)[0].trigger('click')
    await flushPromises()

    expect(confirmDestructive).toHaveBeenCalledWith(
      'Delete source "The Design of Tests"? Citations referencing it will stop rendering.',
    )
    expect(onRemove).toHaveBeenCalledWith('doe-2020')
    // The built-in dialog is never rendered when the host owns one.
    expect(dialogNode('confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('keeps the source when the host dialog declines', async () => {
    const confirmDestructive = vi.fn().mockResolvedValue(false)
    const onRemove = vi.fn()
    const wrapper = mountAttached({ confirmDestructive, onRemove })

    await deleteButtons(wrapper)[0].trigger('click')
    await flushPromises()

    expect(confirmDestructive).toHaveBeenCalledOnce()
    expect(onRemove).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the source when the host dialog rejects', async () => {
    const confirmDestructive = vi.fn().mockRejectedValue(new Error('dialog broke'))
    const onRemove = vi.fn()
    const wrapper = mountAttached({ confirmDestructive, onRemove })

    await deleteButtons(wrapper)[0].trigger('click')
    await flushPromises()

    // A failing host dialog must never delete anything.
    expect(onRemove).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('accepts a synchronous boolean from the host', async () => {
    const onRemove = vi.fn()
    const wrapper = mountAttached({ confirmDestructive: () => true, onRemove })

    await deleteButtons(wrapper)[0].trigger('click')
    await flushPromises()

    expect(onRemove).toHaveBeenCalledWith('doe-2020')
    wrapper.unmount()
  })
})
