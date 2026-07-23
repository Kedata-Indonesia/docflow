import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
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
