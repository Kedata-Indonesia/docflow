import { describe, expect, it } from 'vitest'
import { parseCslStyle } from '../csl/parseCslStyle.js'
import { CSL_STYLES } from '../csl/index.js'

/**
 * Issue #251 — the `.csl` import path derives the picker metadata from the
 * style XML: id from `<info><id>` (a URI in real styles; the short last segment
 * is what the picker uses), name from `<info><title>`, and category from
 * `<category citation-format>` (falling back to the root class).
 */
describe('parseCslStyle (#251)', () => {
  it('reads the metadata of the bundled styles', () => {
    expect(parseCslStyle(CSL_STYLES.apa.xml)).toMatchObject({
      id: 'apa',
      name: 'APA Style 7th edition',
      category: 'in-text',
    })
    expect(parseCslStyle(CSL_STYLES['chicago-notes-bibliography'].xml)).toMatchObject({
      id: 'chicago-notes-bibliography',
      name: 'Chicago Manual of Style 18th edition (notes and bibliography)',
      category: 'note',
    })
  })

  it('derives a short id from the info URI, decodes entities, and skips <title-short>', () => {
    const xml = [
      "<?xml version='1.0' encoding='utf-8'?>",
      "<style xmlns='http://purl.org/net/xbiblio/csl' class='in-text' version='1.0'>",
      '  <info>',
      '    <title-short>ACME</title-short>',
      '    <title>ACME Journal &amp; Review 2026</title>',
      '    <id>http://example.org/styles/acme-2026</id>',
      '  </info>',
      '  <citation><layout prefix="ACME(" suffix=")"><text variable="title"/></layout></citation>',
      '  <bibliography><layout><text variable="title"/></layout></bibliography>',
      '</style>',
    ].join('\n')

    expect(parseCslStyle(xml)).toMatchObject({
      id: 'acme-2026',
      name: 'ACME Journal & Review 2026',
      category: 'in-text',
    })
  })

  it('classifies a note style from <category citation-format="note">', () => {
    const xml = [
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">',
      '<info><title>Imported note style</title><id>note-import</id><category citation-format="note"/></info>',
      '<citation><layout><text variable="title"/></layout></citation>',
      '</style>',
    ].join('')

    expect(parseCslStyle(xml).category).toBe('note')
  })

  it('falls back to the root class, then to in-text', () => {
    const classes = (styleClass: string) =>
      [
        `<style xmlns="http://purl.org/net/xbiblio/csl" class="${styleClass}" version="1.0">`,
        '<info><title>Classed</title><id>classed</id></info>',
        '<citation><layout><text variable="title"/></layout></citation>',
        '</style>',
      ].join('')

    expect(parseCslStyle(classes('note')).category).toBe('note')
    expect(parseCslStyle(classes('in-text')).category).toBe('in-text')
  })

  it('falls back to the id when the style has no title', () => {
    const xml = [
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">',
      '<info><id>http://example.org/styles/untitled-style</id></info>',
      '<citation><layout><text variable="title"/></layout></citation>',
      '</style>',
    ].join('')

    expect(parseCslStyle(xml).name).toBe('untitled-style')
  })

  it('accepts a root id when the file has no info id', () => {
    const xml = [
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" id="root-id">',
      '<info><title>Root id</title></info>',
      '<citation><layout><text variable="title"/></layout></citation>',
      '</style>',
    ].join('')

    expect(parseCslStyle(xml).id).toBe('root-id')
  })

  it('rejects files that are not usable CSL styles', () => {
    expect(() => parseCslStyle('')).toThrow(/empty/)
    expect(() => parseCslStyle('   ')).toThrow(/empty/)
    expect(() => parseCslStyle('not xml')).toThrow(/missing the <style> root/)
    expect(() =>
      parseCslStyle('<style xmlns="http://purl.org/net/xbiblio/csl"><info><title>x</title></info></style>'),
    ).toThrow(/id/)
    expect(() =>
      parseCslStyle(
        '<style xmlns="http://purl.org/net/xbiblio/csl"><info><id>truncated</id><title>x</title></info><citation></citation>',
      ),
    ).toThrow(/truncated/)
    expect(() =>
      parseCslStyle(
        '<style xmlns="http://purl.org/net/xbiblio/csl"><info><id>no-citation</id><title>x</title></info></style>',
      ),
    ).toThrow(/citation/)
  })
})
