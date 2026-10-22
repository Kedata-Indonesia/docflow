import { describe, expect, it } from 'vitest'
import { parseCslStyle } from '../csl/parseCslStyle.js'
import { CSL_STYLES } from '../csl/index.js'

/**
 * Issue #251 — the `.csl` import path derives the picker metadata from the
 * style XML: id from `<info><id>` (the canonical CSL URI), name from
 * `<info><title>`, and category from `<category citation-format>` (falling
 * back to the root class).
 *
 * Issue #360 — the id is the URI **verbatim**; narrowing it to the last
 * segment made unrelated styles share a key.
 */
describe('parseCslStyle (#251)', () => {
  it('reads the metadata of the bundled styles', () => {
    // The id is the style's own CSL URI, not the key the library files it under.
    expect(parseCslStyle(CSL_STYLES.apa.xml)).toMatchObject({
      id: 'http://www.zotero.org/styles/apa',
      name: 'APA Style 7th edition',
      category: 'in-text',
    })
    expect(parseCslStyle(CSL_STYLES['chicago-notes-bibliography'].xml)).toMatchObject({
      name: 'Chicago Manual of Style 18th edition (notes and bibliography)',
      category: 'note',
    })
  })

  it('keeps the full info URI as the id, decodes entities, and skips <title-short>', () => {
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
      id: 'http://example.org/styles/acme-2026',
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

/**
 * Issue #360 — the id must be the canonical CSL URI, not its last segment.
 * The segment used to be the registry key, so two unrelated files shared one
 * key and an imported style could silently replace a bundled one.
 */
describe('parseCslStyle — style identity (#360)', () => {
  function styleWith(info: string): string {
    return [
      '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">',
      `<info><title>Style</title>${info}</info>`,
      '<citation><layout><text variable="title"/></layout></citation>',
      '</style>',
    ].join('')
  }

  it('gives two URIs with the same last segment distinct ids', () => {
    const zotero = parseCslStyle(
      styleWith('<id>https://www.zotero.org/styles/harvard-cite-them-right</id>'),
    )
    const campus = parseCslStyle(
      styleWith('<id>https://contoh.ac.id/styles/harvard-cite-them-right</id>'),
    )

    // Before #360 both collapsed to `harvard-cite-them-right`.
    expect(zotero.id).not.toBe(campus.id)
    expect(zotero.id).toBe('https://www.zotero.org/styles/harvard-cite-them-right')
    expect(campus.id).toBe('https://contoh.ac.id/styles/harvard-cite-them-right')
  })

  it('does not adopt a bundled style id, so an imported APA cannot shadow the bundled one', () => {
    const imported = parseCslStyle(styleWith('<id>https://contoh.ac.id/styles/apa</id>'))

    // The bundled style is filed under `apa`; the import must not claim it.
    expect(imported.id).not.toBe('apa')
    expect(imported.id).toBe('https://contoh.ac.id/styles/apa')
    expect(Object.keys(CSL_STYLES)).toContain('apa')
  })

  it('is stable for the same file, so re-importing replaces instead of duplicating', () => {
    const xml = styleWith('<id>https://contoh.ac.id/styles/house-style</id>')
    expect(parseCslStyle(xml).id).toBe(parseCslStyle(xml).id)
  })
})
