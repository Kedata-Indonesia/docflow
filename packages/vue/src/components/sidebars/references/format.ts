import type { CslItemData } from '@kedata-indonesia/docflow-core'
import type { LocaleContext } from '../../../composables/useLocale.js'

/**
 * Pure helpers behind the reference manager UI: list-row formatting, search
 * matching, and the create/edit form model. Kept out of the components so the
 * sidebar, list row, and form share one source of truth (and so the mapping
 * CSL-JSON ↔ form is unit-testable without mounting anything).
 */

export type Translate = LocaleContext['t']

/** One entry in the citation-style picker. */
export interface ReferenceStyleOption {
  id: string
  name: string
  /**
   * Issue #361 — true for styles the user imported, which they may remove. The
   * bundled four are the offline fallback and stay put.
   */
  removable?: boolean
}

export const SOURCE_TYPES = [
  'book',
  'article-journal',
  'chapter',
  'webpage',
  'report',
  'thesis',
  'document',
] as const

export interface AuthorRow {
  family: string
  given: string
}

export interface ReferenceFormState {
  type: string
  title: string
  authors: AuthorRow[]
  year: string
  publisher: string
  publisherPlace: string
  containerTitle: string
  volume: string
  issue: string
  page: string
  doi: string
  url: string
}

export function emptyForm(): ReferenceFormState {
  return {
    type: 'book',
    title: '',
    authors: [{ family: '', given: '' }],
    year: '',
    publisher: '',
    publisherPlace: '',
    containerTitle: '',
    volume: '',
    issue: '',
    page: '',
    doi: '',
    url: '',
  }
}

/** CSL dates are either `date-parts` or a free-form `raw`/`literal` string. */
function yearFromText(value: string | undefined): string {
  return value?.match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1] ?? ''
}

export function yearOf(source: CslItemData): string {
  const year = source.issued?.['date-parts']?.[0]?.[0]
  if (year) return String(year)
  return yearFromText(source.issued?.raw) || yearFromText(source.issued?.literal)
}

export function authorLabel(source: CslItemData, t: Translate): string {
  const authors = source.author ?? []
  if (authors.length === 0) return t('sidebars.references.anonymous')
  const first = authors[0]
  const name = first.family ?? first.literal ?? ''
  return authors.length > 1 ? `${name} ${t('sidebars.references.etAl')}` : name
}

export function typeLabel(type: string, t: Translate): string {
  const key = `sidebars.references.types.${type}`
  const translated = t(key)
  return translated === key ? type : translated
}

/** Fold case and collapse runs of whitespace so a sloppy query still matches. */
function normalizeForSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Case-insensitive match across the fields a user actually recognises. */
export function matchesQuery(source: CslItemData, query: string): boolean {
  const q = normalizeForSearch(query)
  if (!q) return true
  const haystack = normalizeForSearch(
    [
      source.title,
      source['container-title'],
      source.publisher,
      source.DOI,
      source.URL,
      ...(source.author ?? []).map((a) => `${a.family ?? ''} ${a.given ?? ''} ${a.literal ?? ''}`),
    ]
      .filter(Boolean)
      .join(' '),
  )
  return haystack.includes(q)
}

/** CSL-JSON → form model. Literal-only authors collapse into the family field. */
export function formFromSource(source: CslItemData): ReferenceFormState {
  const authors = (source.author ?? [])
    .filter((a) => !a.literal)
    .map((a) => ({ family: a.family ?? '', given: a.given ?? '' }))
  const literal = (source.author ?? []).find((a) => a.literal)
  if (authors.length === 0) {
    authors.push({ family: literal?.literal ?? '', given: '' })
  }
  return {
    type: source.type || 'book',
    title: source.title ?? '',
    authors,
    year: yearOf(source),
    publisher: source.publisher ?? '',
    publisherPlace: source['publisher-place'] ?? '',
    containerTitle: source['container-title'] ?? '',
    volume: source.volume ?? '',
    issue: source.issue ?? '',
    page: source.page ?? '',
    doi: source.DOI ?? '',
    url: source.URL ?? '',
  }
}

/** Form model → CSL-JSON. Empty fields are omitted so CSL styles see `undefined`. */
export function formToSource(form: ReferenceFormState, id: string): CslItemData {
  const authors = form.authors
    .filter((a) => a.family.trim() || a.given.trim())
    .map((a) => ({ family: a.family.trim(), given: a.given.trim() }))
  const year = parseInt(form.year, 10)

  const source: CslItemData = {
    id,
    type: form.type,
    title: form.title.trim(),
  }
  if (authors.length > 0) source.author = authors
  if (Number.isFinite(year)) source.issued = { 'date-parts': [[year]] }
  if (form.publisher.trim()) source.publisher = form.publisher.trim()
  if (form.publisherPlace.trim()) source['publisher-place'] = form.publisherPlace.trim()
  if (form.containerTitle.trim()) source['container-title'] = form.containerTitle.trim()
  if (form.volume.trim()) source.volume = form.volume.trim()
  if (form.issue.trim()) source.issue = form.issue.trim()
  if (form.page.trim()) source.page = form.page.trim()
  if (form.doi.trim()) source.DOI = form.doi.trim()
  if (form.url.trim()) source.URL = form.url.trim()
  return source
}

/** Which form fields the selected CSL type can carry. */
export function visibleFields(type: string) {
  return {
    publisher: ['book', 'chapter', 'report', 'thesis', 'document'].includes(type),
    container: ['article-journal', 'chapter'].includes(type),
    locator: ['article-journal', 'chapter'].includes(type),
    doi: type === 'article-journal',
    url: ['webpage', 'report'].includes(type),
  }
}
