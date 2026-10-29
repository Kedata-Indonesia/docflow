import { describe, expect, it } from 'vitest'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import {
  SOURCE_TYPES,
  authorLabel,
  emptyForm,
  formFromSource,
  formToSource,
  matchesQuery,
  typeLabel,
  visibleFields,
  yearOf,
} from '../components/sidebars/references/format.js'

const messages: Record<string, string> = {
  'sidebars.references.anonymous': 'Anonymous',
  'sidebars.references.etAl': 'et al.',
  'sidebars.references.types.book': 'Book',
  'sidebars.references.types.webpage': 'Web page',
}

function translate(key: string): string {
  return messages[key] ?? key
}

const book: CslItemData = {
  id: 'doe-2020',
  type: 'book',
  title: 'The Design of Tests',
  author: [{ family: 'Doe', given: 'John' }],
  issued: { 'date-parts': [[2020]] },
  publisher: 'Test Press',
  'publisher-place': 'Jakarta',
  DOI: '10.1000/xyz',
  URL: 'https://example.com/doe',
}

describe('reference format helpers', () => {
  it('builds a fresh empty form with one blank author row', () => {
    const first = emptyForm()
    const second = emptyForm()

    expect(first.type).toBe('book')
    expect(first.title).toBe('')
    expect(first.authors).toEqual([{ family: '', given: '' }])
    expect(first.authors).not.toBe(second.authors)
    expect(SOURCE_TYPES).toContain('article-journal')
  })

  it('reads the year from date-parts, raw dates, and literals', () => {
    expect(yearOf(book)).toBe('2020')
    expect(yearOf({ ...book, issued: { raw: '2021-04-17' } })).toBe('2021')
    expect(yearOf({ ...book, issued: { literal: 'c. 1998' } })).toBe('1998')
    expect(yearOf({ id: 'x', type: 'book', title: 'Untitled' })).toBe('')
    expect(yearOf({ ...book, issued: { literal: 'n.d.' } })).toBe('')
  })

  it('labels authors, including literal-only names', () => {
    expect(authorLabel({ id: 'x', type: 'book', title: 'T' }, translate)).toBe('Anonymous')
    expect(authorLabel(book, translate)).toBe('Doe')
    expect(
      authorLabel({ ...book, author: [...book.author!, { family: 'Roe', given: 'Jane' }] }, translate),
    ).toBe('Doe et al.')
    expect(
      authorLabel({ id: 'x', type: 'book', title: 'T', author: [{ literal: 'UNESCO' }] }, translate),
    ).toBe('UNESCO')
  })

  it('translates known source types and falls back to the raw type', () => {
    expect(typeLabel('book', translate)).toBe('Book')
    expect(typeLabel('webpage', translate)).toBe('Web page')
    expect(typeLabel('thesis', translate)).toBe('thesis')
  })

  it('matches a trimmed, case-insensitive query across searchable fields', () => {
    expect(matchesQuery(book, '   ')).toBe(true)
    expect(matchesQuery(book, 'design of tests')).toBe(true)
    expect(matchesQuery(book, '  DESIGN   OF TESTS ')).toBe(true)
    expect(matchesQuery(book, 'JOHN')).toBe(true)
    expect(matchesQuery(book, '10.1000/xyz')).toBe(true)
    expect(matchesQuery(book, 'example.com')).toBe(true)
    expect(matchesQuery(book, 'missing')).toBe(false)
  })

  it('maps CSL-JSON to the form model', () => {
    const form = formFromSource(book)

    expect(form.type).toBe('book')
    expect(form.title).toBe('The Design of Tests')
    expect(form.authors).toEqual([{ family: 'Doe', given: 'John' }])
    expect(form.year).toBe('2020')
    expect(form.publisher).toBe('Test Press')
    expect(form.publisherPlace).toBe('Jakarta')
    expect(form.doi).toBe('10.1000/xyz')
    expect(form.url).toBe('https://example.com/doe')
  })

  it('collapses literal-only authors into the family field', () => {
    const form = formFromSource({
      id: 'x',
      type: 'book',
      title: 'T',
      author: [{ literal: 'UNESCO' }],
    })

    expect(form.authors).toEqual([{ family: 'UNESCO', given: '' }])
  })

  it('normalises missing and blank fields when editing', () => {
    const form = formFromSource({
      id: 'x',
      type: '',
      title: undefined,
      author: [{ family: '', given: undefined }],
      issued: { literal: 'n.d.' },
      publisher: '',
      DOI: undefined,
    })

    expect(form.type).toBe('book')
    expect(form.title).toBe('')
    expect(form.authors).toEqual([{ family: '', given: '' }])
    expect(form.year).toBe('')
    expect(form.publisher).toBe('')
    expect(form.doi).toBe('')

    const empty = formFromSource({ id: 'y', type: 'book', title: 'T', author: [] })
    expect(empty.authors).toEqual([{ family: '', given: '' }])
  })

  it('maps the form back to CSL-JSON and omits empty fields', () => {
    const form = formFromSource(book)
    form.authors = [{ family: '  Doe ', given: ' John ' }, { family: '', given: '' }]
    form.page = ' 10-20 '

    const source = formToSource(form, 'doe-2020')

    expect(source.id).toBe('doe-2020')
    expect(source.author).toEqual([{ family: 'Doe', given: 'John' }])
    expect(source.page).toBe('10-20')
    expect(source.issued).toEqual({ 'date-parts': [[2020]] })

    const minimal = formToSource(emptyForm(), 'new-id')
    expect(minimal).toEqual({ id: 'new-id', type: 'book', title: '' })
    expect(minimal.issued).toBeUndefined()
  })

  it('exposes the fields a source type can carry', () => {
    expect(visibleFields('book')).toEqual({
      publisher: true,
      container: false,
      locator: false,
      doi: false,
      url: false,
    })
    expect(visibleFields('article-journal')).toEqual({
      publisher: false,
      container: true,
      locator: true,
      doi: true,
      url: false,
    })
    expect(visibleFields('webpage')).toEqual({
      publisher: false,
      container: false,
      locator: false,
      doi: false,
      url: true,
    })
  })
})
