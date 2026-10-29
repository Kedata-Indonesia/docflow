import type { CslItemData, CslStyleInfo } from '@kedata-indonesia/docflow-core'
import type { CitationAttrs, CitationCluster } from './citeTypes.js'
import { sanitizeCiteprocHtml } from './citeHtml.js'
import { createCslEngine } from './citeStyles.js'

/**
 * Derived-view renderer: take the document's citation clusters + source map and
 * replay them through a fresh citeproc engine.
 *
 * Pure data in, plain data out — no editor, no storage, no listeners — so the
 * same code runs in an editor, in a unit test and in the server entry.
 */

/**
 * Document-order fingerprint of every cluster. The engine replays the whole
 * document on any change, so an unchanged signature means an unchanged render:
 * plain typing costs one walk and no citeproc work.
 */
export function buildClusterSignature(ordered: CitationCluster[]): string {
  return ordered
    .map((cluster) => {
      const a = cluster.attrs
      return `${cluster.citationId}|${a.sourceId ?? ''}|${a.locator ?? ''}|${a.label ?? ''}|${
        a.mode ?? ''
      }|${a.prefix ?? ''}|${a.suffix ?? ''}`
    })
    .join('\n')
}

export interface RenderCitationsInput {
  styleInfo: CslStyleInfo
  /** Every saved source, cited or not (uncited ones still reach the bibliography). */
  sources: Map<string, CslItemData>
  clusters: Map<string, CitationAttrs>
  /** Cluster ids in document order. */
  order: string[]
}

export interface RenderedCitations {
  /** Cluster id → sanitized inline/note text ('' when unknown or missing). */
  rendered: Map<string, string>
  /** Cited-only entries (the old `bibliography` semantics). */
  referenceList: string[]
  /** All saved sources, including uncited ones (issue #252). */
  bibliography: string[]
}

/**
 * Rebuild a fresh CSL.Engine and replay all clusters in document order.
 * citeproc is stateful (ibid., subsequent-short forms), so a full ordered
 * replay is the only reliable way to keep every cluster consistent after
 * any edit — the same derived-view pattern used for pagination/collab.
 */
export function renderCitations(input: RenderCitationsInput): RenderedCitations {
  const { styleInfo, sources, clusters, order } = input
  const engine = createCslEngine(styleInfo.xml, (id: string) => (
    sources.get(id) as Record<string, unknown> | undefined
  ))

  const rendered = new Map<string, string>()
  const pre: Array<[string, number]> = []
  let noteIndex = 0

  for (const citationId of order) {
    const attrs = clusters.get(citationId)
    if (!attrs?.sourceId || !sources.has(attrs.sourceId)) {
      rendered.set(citationId, '')
      continue
    }

    noteIndex += 1
    try {
      const [, result] = engine.processCitationCluster(
        {
          citationID: citationId,
          citationItems: [
            {
              id: attrs.sourceId,
              locator: attrs.locator || undefined,
              label: attrs.label || undefined,
              prefix: attrs.prefix || undefined,
              suffix: attrs.suffix || undefined,
              'suppress-author': attrs.mode === 'suppress-author' || undefined,
              'author-only': attrs.mode === 'author-only' || undefined,
            },
          ],
          properties: { noteIndex: styleInfo.category === 'note' ? noteIndex : 0 },
        },
        pre,
        [],
      )
      pre.push([citationId, noteIndex])
      // The result lists EVERY cluster whose rendering changed — including
      // earlier ones flipped by ibid./short-form logic. Apply them all.
      for (const [, text, id] of result ?? []) {
        rendered.set(id, sanitizeCiteprocHtml(text))
      }
      if (!rendered.has(citationId)) rendered.set(citationId, '')
    } catch {
      // A malformed source must never break the whole document render.
      rendered.set(citationId, '')
    }
  }

  let referenceList: string[] = []
  let bibliography: string[] = []

  try {
    // Cited-only set first (the old bibliography semantics → referenceList).
    const cited = engine.makeBibliography()
    referenceList = cited ? cited[1].map((entry) => sanitizeCiteprocHtml(entry).trim()) : []

    // Register every saved source so uncited items also land in the
    // bibliography (issue #252). `updateItems` is part of citeproc's API.
    if (typeof engine.updateItems === 'function') {
      engine.updateItems([...sources.keys()])
    }
    const all = engine.makeBibliography()
    bibliography = all ? all[1].map((entry) => sanitizeCiteprocHtml(entry).trim()) : []
  } catch {
    referenceList = []
    bibliography = []
  }

  return { rendered, referenceList, bibliography }
}
