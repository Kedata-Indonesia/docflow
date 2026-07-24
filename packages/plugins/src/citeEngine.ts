/// <reference path="./types/citeproc.d.ts" />
import CSL from 'citeproc'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import { CSL_STYLES, CSL_LOCALE_EN_US, DEFAULT_CSL_STYLE } from './csl/index.js'

export type CitationMode = 'normal' | 'author-only' | 'suppress-author'

/**
 * Structured citation attributes stored on citation/footnote nodes. Nodes
 * store references only — every rendered string is derived by the engine
 * from CSL-JSON sources + the active CSL style (phase-6 plan §2 decision 1).
 */
export interface CitationAttrs {
  sourceId: string | null
  locator?: string
  label?: string
  mode?: CitationMode
  prefix?: string
  suffix?: string
}

export interface CiteEngineOptions {
  sources?: CslItemData[]
  style?: string
}

export interface CitationCluster {
  citationId: string
  attrs: CitationAttrs
}

type ChangeListener = () => void

let clusterSeq = 0

/** Stable, unique-enough id for a citation cluster instance in a document. */
export function nextCitationId(): string {
  clusterSeq += 1
  return `cite-${Date.now().toString(36)}-${clusterSeq.toString(36)}`
}

/**
 * citeproc-js emits a small, fixed set of formatting tags (<i>, <sup>,
 * <span style="font-variant:small-caps;">, plus its <div class="csl-entry">
 * bibliography wrapper). Allow exactly those, escape everything else —
 * source metadata is user input and must never become active markup.
 */
const CITEPROC_TAG = /^<\/?(i|b|em|strong|sup|sub|span|nobr)( style="font-variant: ?small-caps;?")?\/?>$|^<div class="csl-entry">$|^<\/div>$/

export function sanitizeCiteprocHtml(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) => (CITEPROC_TAG.test(tag) ? tag : tag.replace(/</g, '&lt;').replace(/>/g, '&gt;')))
}

/**
 * Document-scoped citation engine. Wraps citeproc-js: holds the CSL-JSON
 * source map + active style, recomputes ALL clusters in document order on
 * every change (correct ibid./short-form handling for note styles), and
 * emits a single 'change' so every node view repaints from one source of
 * truth (phase-6 plan §2 decision 2).
 *
 * The engine is plain TS — no editor/DOM imports — so it is unit-testable
 * headlessly and reusable from any host.
 */
export class CiteEngine {
  private sources = new Map<string, CslItemData>()
  private style: string
  private clusters = new Map<string, CitationAttrs>()
  private order: string[] = []
  private rendered = new Map<string, string>()
  private bibliography: string[] = []
  private listeners = new Set<ChangeListener>()

  constructor(options: CiteEngineOptions = {}) {
    this.style = options.style && CSL_STYLES[options.style] ? options.style : DEFAULT_CSL_STYLE
    this.updateSources(options.sources ?? [], false)
  }

  getStyle(): string {
    return this.style
  }

  /** 'note' styles (Chicago notes-bib) cite via footnotes; 'in-text' cite inline. */
  isNoteStyle(): boolean {
    return CSL_STYLES[this.style]?.category === 'note'
  }

  getSource(id: string): CslItemData | undefined {
    return this.sources.get(id)
  }

  getSourceIds(): string[] {
    return [...this.sources.keys()]
  }

  getCitedSourceIds(): string[] {
    const ids = new Set<string>()
    for (const attrs of this.clusters.values()) {
      if (attrs.sourceId) ids.add(attrs.sourceId)
    }
    return [...ids]
  }

  /** Live style switch: reload the CSL, recompute everything, repaint (6A-7). */
  setStyle(styleId: string): void {
    if (!CSL_STYLES[styleId] || styleId === this.style) return
    this.style = styleId
    this.recompute()
    this.emitChange()
  }

  updateSources(sources: CslItemData[], emit = true): void {
    this.sources = new Map(sources.map((s) => [s.id, s]))
    this.recompute()
    if (emit) this.emitChange()
  }

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /**
   * Replace the cluster registry with the current document state, in
   * document order. The caller (editor sync) walks the PM doc; the engine
   * recomputes only when the ordered signature actually changed.
   */
  syncCitations(ordered: CitationCluster[]): boolean {
    const signature = ordered
      .map((c) => {
        const a = c.attrs
        return `${c.citationId}|${a.sourceId ?? ''}|${a.locator ?? ''}|${a.label ?? ''}|${a.mode ?? ''}|${a.prefix ?? ''}|${a.suffix ?? ''}`
      })
      .join('\n')
    if (signature === this.lastSignature) return false
    this.lastSignature = signature
    this.clusters = new Map(ordered.map((c) => [c.citationId, c.attrs]))
    this.order = ordered.map((c) => c.citationId)
    this.recompute()
    this.emitChange()
    return true
  }

  private lastSignature = ''

  /** Last computed in-text/note text for a cluster ('' when unknown/missing). */
  renderCluster(citationId: string): string {
    return this.rendered.get(citationId) ?? ''
  }

  /** Bibliography entries (citeproc-sorted), sanitized HTML strings. */
  getBibliography(): string[] {
    return this.bibliography
  }

  private emitChange(): void {
    for (const cb of this.listeners) cb()
  }

  /**
   * Rebuild a fresh CSL.Engine and replay all clusters in document order.
   * citeproc is stateful (ibid., subsequent-short forms), so a full ordered
   * replay is the only reliable way to keep every cluster consistent after
   * any edit — the same derived-view pattern used for pagination/collab.
   */
  private recompute(): void {
    const styleInfo = CSL_STYLES[this.style]
    const engine = new CSL.Engine(
      {
        retrieveLocale: () => CSL_LOCALE_EN_US,
        retrieveItem: (id: string) => this.sources.get(id) as Record<string, unknown> | undefined,
      },
      styleInfo.xml,
      'en-US',
    )

    const next = new Map<string, string>()
    const pre: Array<[string, number]> = []
    let noteIndex = 0
    for (const citationId of this.order) {
      const attrs = this.clusters.get(citationId)
      if (!attrs?.sourceId || !this.sources.has(attrs.sourceId)) {
        next.set(citationId, '')
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
          next.set(id, sanitizeCiteprocHtml(text))
        }
        if (!next.has(citationId)) next.set(citationId, '')
      } catch {
        // A malformed source must never break the whole document render.
        next.set(citationId, '')
      }
    }
    this.rendered = next

    try {
      const bib = engine.makeBibliography()
      this.bibliography = bib ? bib[1].map((entry) => sanitizeCiteprocHtml(entry).trim()) : []
    } catch {
      this.bibliography = []
    }
  }
}
