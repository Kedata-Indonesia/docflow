import type { CslStyleInfo } from '@kedata-indonesia/docflow-core'

/**
 * Issue #251 — derive the metadata the picker needs (`id`, `name`, `category`)
 * from a CSL style file, without pulling a DOM or an XML dependency into the
 * plugins package. citeproc still parses (and validates) the XML itself when
 * the style is registered/rendered; this only reads the three fields the
 * Citation Style dropdown and the note-style path need.
 *
 * Not a general-purpose XML parser: CSL styles are a flat `<style>` document
 * with an `<info>` block, so a focused string scan is enough and keeps
 * `docflow-plugins/citations` usable outside a browser.
 */

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return XML_ENTITIES[entity] ?? match
  })
}

function readAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[1] ?? match[2]) : undefined
}

/**
 * Parse a `.csl` file's XML into the `CslStyleInfo` the engine and the picker
 * use. Throws a descriptive error for anything that is not a usable CSL style;
 * callers surface that as "not a valid CSL style" and leave the engine intact.
 */
export function parseCslStyle(xml: string): CslStyleInfo {
  if (typeof xml !== 'string') {
    throw new Error('parseCslStyle: expected the CSL XML as a string')
  }
  const source = xml.replace(/^\uFEFF/, '').trim()
  if (!source) {
    throw new Error('parseCslStyle: the file is empty')
  }

  const styleTag = source.match(/<style\b[^>]*>/i)?.[0]
  if (!styleTag) {
    throw new Error('parseCslStyle: not a CSL style (missing the <style> root element)')
  }

  const info = source.match(/<info\b[^>]*>([\s\S]*?)<\/info>/i)?.[1] ?? ''
  // CSL defines `<info><id>` as a globally unique URI, which is exactly the
  // property a registry key needs — so that value IS the style id.
  //
  // Issue #360: this used to be narrowed to the URI's last segment (`apa`
  // instead of the Zotero URL), which made the key collide across unrelated
  // files and let an imported style silently replace a bundled one. The full
  // URI is unique by construction, stable across sessions, and keeps
  // re-importing the same file idempotent (same URI → same id → replace).
  //
  // Some files also carry an `id` on the root; citeproc rejects that attribute,
  // so it is only a fallback for files that would fail registration anyway.
  const infoId = info.match(/<id(?![\w-])[^>]*>([\s\S]*?)<\/id>/i)?.[1]
  const infoIdValue = infoId ? decodeXmlEntities(infoId).trim() : ''
  const id = infoIdValue || readAttribute(styleTag, 'id')?.trim()
  if (!id) {
    throw new Error('parseCslStyle: the CSL style is missing its required <info><id> element')
  }

  // `<title>` inside `<info>`; the negative lookahead keeps `<title-short>` out.
  const title = info.match(/<title(?![\w-])[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const titleText = title ? decodeXmlEntities(title).replace(/\s+/g, ' ').trim() : ''
  // A titleless style falls back to the id's last segment rather than the whole
  // URI — the picker still has to show something a human can read.
  const shortId = id.replace(/\/+$/, '').split('/').pop() || id
  const name = titleText || shortId

  const citationFormat = (source.match(/<category\b[^>]*>/gi) ?? [])
    .map((tag) => readAttribute(tag, 'citation-format'))
    .find((value) => Boolean(value))
  const styleClass = readAttribute(styleTag, 'class')
  const category = (citationFormat ?? styleClass ?? '').trim().toLowerCase() === 'note'
    ? 'note'
    : 'in-text'

  if (!/<citation\b/i.test(source)) {
    throw new Error('parseCslStyle: not a CSL style (missing a <citation> layout)')
  }
  if (!/<\/style\s*>\s*$/i.test(source)) {
    throw new Error('parseCslStyle: the CSL XML is truncated (missing </style>)')
  }

  return { id, name, category, xml: source }
}
