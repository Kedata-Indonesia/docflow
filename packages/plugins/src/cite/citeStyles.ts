// The triple-slash reference is required so consumers that compile this
// source via path aliases (e.g. apps/web vue-tsc) pick up the ambient
// `declare module 'citeproc'` in ./types/citeproc.d.ts. The plugins package's
// own tsconfig include also covers it, but cross-package typecheck does not.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- citeproc ambient types must load before the import for path-aliased consumers
/// <reference path="../types/citeproc.d.ts" />
import CSL from 'citeproc'
import type { Engine } from 'citeproc'
import type { CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { CSL_STYLES, CSL_LOCALE_EN_US } from '../csl/index.js'

/**
 * Style registry + citeproc engine construction.
 *
 * This is the only module that imports citeproc as a value: everything else
 * receives a ready engine or plain data, which keeps the citation renderer
 * testable with a fake and keeps the CommonJS dependency in one place.
 */

/** `id=<json>, xml=<n> chars` — the suffix of every style validation error. */
function describeStyle(style: CslStyleInfo | undefined): string {
  const xml = style?.xml
  const xmlDetail = xml === undefined
    ? 'undefined'
    : `${typeof xml === 'string' ? xml.length : typeof xml} chars`
  return `id=${JSON.stringify(style?.id)}, xml=${xmlDetail}`
}

/**
 * Validate the id+xml contract shared by every style entry point and return the
 * trimmed id. `operation` prefixes the error so callers stay identifiable.
 */
export function requireStyleShape(operation: string, style: CslStyleInfo): string {
  const id = typeof style?.id === 'string' ? style.id.trim() : ''
  if (id && typeof style?.xml === 'string' && style.xml.trim() !== '') return id
  throw new Error(
    `${operation}: every style needs a non-empty id and CSL xml (got ${describeStyle(style)})`,
  )
}

/**
 * Merge the bundled styles with the ones a host injected (issue #180) — the
 * single place that decides what this engine can render with.
 *
 * Bundled styles stay available unless the host overrides one by id, so a host
 * that passes nothing (or an empty array) behaves exactly as before and nothing
 * has to be fetched at runtime for the defaults to work offline.
 *
 * A malformed entry fails loudly here rather than inside citeproc, where the
 * error would arrive as an empty citation with no clue which style caused it.
 */
export function resolveCslStyles(extra?: CslStyleInfo[]): Record<string, CslStyleInfo> {
  const merged: Record<string, CslStyleInfo> = { ...CSL_STYLES }
  for (const style of extra ?? []) {
    const id = requireStyleShape('resolveCslStyles', style)
    merged[id] = { ...style, id }
  }
  return merged
}

/** True when `id` names a style that ships with the package. */
export function isBundledStyleId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CSL_STYLES, id)
}

/** Trimmed id + name/category defaults for a runtime-registered style. */
export function normalizeRegisteredStyle(style: CslStyleInfo): CslStyleInfo {
  const id = requireStyleShape('registerStyle', style)
  return {
    id,
    name: typeof style.name === 'string' && style.name.trim() ? style.name.trim() : id,
    category: style.category === 'note' ? 'note' : 'in-text',
    xml: style.xml,
  }
}

/**
 * Build a citeproc engine. citeproc is CommonJS and keeps per-document state
 * (ibid., subsequent-short forms), so callers must build a fresh instance
 * whenever sources or style change instead of mutating one in place.
 */
export function createCslEngine(
  styleXml: string,
  retrieveItem: (id: string) => Record<string, unknown> | undefined,
): Engine {
  return new CSL.Engine({ retrieveLocale: () => CSL_LOCALE_EN_US, retrieveItem }, styleXml, 'en-US')
}

/**
 * Fail before the registry is mutated: citeproc is the authority on whether an
 * XML string is a usable CSL style. Throwing here leaves the registry, the
 * active style and the rendered output untouched, so an invalid import cannot
 * blank an open document.
 */
export function assertCiteprocParses(id: string, xml: string): void {
  try {
    createCslEngine(xml, () => undefined)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `registerStyle: citeproc could not parse the CSL for ${JSON.stringify(id)}: ${detail}`,
    )
  }
}
