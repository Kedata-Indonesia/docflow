import { describe, expect, it } from 'vitest'
import { BIBLIOGRAPHY_FILE_ACCEPT, detectBibliographyFormat } from '../bibliographyFormats.js'

describe('detectBibliographyFormat (issue #353)', () => {
  it('maps every supported extension, case-insensitively', () => {
    expect(detectBibliographyFormat('refs.bib')).toBe('bibtex')
    expect(detectBibliographyFormat('refs.RIS')).toBe('ris')
    expect(detectBibliographyFormat('refs.enw')).toBe('enw')
    expect(detectBibliographyFormat('refs.json')).toBe('csl-json')
    expect(detectBibliographyFormat('refs.yaml')).toBe('yaml')
    expect(detectBibliographyFormat('refs.yml')).toBe('yaml')
    expect(detectBibliographyFormat('refs.XML')).toBe('xml')
  })

  it('sniffs the content when the extension is unknown or missing', () => {
    expect(detectBibliographyFormat('refs.txt', '@article{a, title={T}}')).toBe('bibtex')
    expect(detectBibliographyFormat('refs.txt', 'TY  - JOUR\nTI  - T\nER  -')).toBe('ris')
    expect(detectBibliographyFormat('refs.txt', '%0 Journal Article\n%T Title')).toBe('enw')
    expect(detectBibliographyFormat('refs.txt', '[{"type":"book","title":"T"}]')).toBe('csl-json')
    expect(detectBibliographyFormat('refs.txt', '- type: book\n  title: T')).toBe('yaml')
    expect(detectBibliographyFormat('refs.txt', '<modsCollection><mods/></modsCollection>')).toBe('xml')
  })

  it('does not mislabel a .json file as BibTeX (the reported bug)', () => {
    expect(detectBibliographyFormat('zotero-export.json', '[]')).toBe('csl-json')
  })

  it('returns null when neither name nor content is conclusive', () => {
    expect(detectBibliographyFormat('notes.txt')).toBeNull()
    expect(detectBibliographyFormat('notes.txt', 'just prose about references')).toBeNull()
    expect(detectBibliographyFormat('', '   ')).toBeNull()
  })

  it('publishes an accept list covering every supported extension', () => {
    for (const extension of ['.bib', '.ris', '.enw', '.json', '.yaml', '.yml', '.xml']) {
      expect(BIBLIOGRAPHY_FILE_ACCEPT).toContain(extension)
    }
  })
})
