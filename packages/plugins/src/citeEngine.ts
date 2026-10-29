import type { CslItemData, CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { buildClusterSignature, renderCitations } from './cite/citeRender.js'
import { StyleRegistry } from './cite/citeStyleRegistry.js'
import type {
  ChangeListener,
  CitationAttrs,
  CitationCluster,
  CiteEngineOptions,
} from './cite/citeTypes.js'

export type { CslStyleInfo }
export { resolveCslStyles } from './cite/citeStyles.js'
export { sanitizeCiteprocHtml } from './cite/citeHtml.js'
export { nextCitationId } from './cite/citeClusterId.js'
export type {
  CitationAttrs,
  CitationCluster,
  CitationMode,
  CiteEngineOptions,
} from './cite/citeTypes.js'

/**
 * Document-scoped citation engine. Wraps citeproc-js: holds the CSL-JSON
 * source map + active style, recomputes ALL clusters in document order on
 * every change (correct ibid./short-form handling for note styles), and
 * emits a single 'change' so every node view repaints from one source of
 * truth (phase-6 plan §2 decision 2).
 *
 * The engine is plain TS — no editor/DOM imports — so it is unit-testable
 * headlessly and reusable from any host. Rendering lives in
 * `cite/citeRender.ts`, the style bookkeeping in `cite/citeStyleRegistry.ts`,
 * validation + citeproc construction in `cite/citeStyles.ts`.
 */
export class CiteEngine {
  private sources = new Map<string, CslItemData>()
  /** Bundled styles + whatever the host injected (issue #180). */
  private readonly registry: StyleRegistry
  private clusters = new Map<string, CitationAttrs>()
  private order: string[] = []
  private rendered = new Map<string, string>()
  /** Cited-only entries (the old `bibliography` semantics). */
  private referenceList: string[] = []
  /** All saved sources, including uncited ones (new `bibliography` semantics). */
  private bibliography: string[] = []
  private listeners = new Set<ChangeListener>()
  private lastSignature = ''

  constructor(options: CiteEngineOptions = {}) {
    this.registry = new StyleRegistry({ styles: options.styles, style: options.style })
    this.updateSources(options.sources ?? [], false)
  }

  getStyle(): string {
    return this.registry.id
  }

  /** Every style this engine can render with, bundled + host-injected. */
  getAvailableStyles(): CslStyleInfo[] {
    return this.registry.list()
  }

  /** 'note' styles (Chicago notes-bib) cite via footnotes; 'in-text' cite inline. */
  isNoteStyle(): boolean {
    return this.registry.isNote
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
    if (!this.registry.setActive(styleId)) return
    this.recompute()
    this.emitChange()
  }

  /**
   * Register a CSL style at runtime (issue #251) — the import-file path. The XML
   * is validated *before* the registry is touched, so a malformed file can never
   * break an open document (see `StyleRegistry.register`).
   *
   * Replacing the active style repaints now; any other registration only
   * notifies listeners (the picker refreshes through the Vue layer).
   */
  registerStyle(style: CslStyleInfo): CslStyleInfo {
    const normalized = this.registry.register(style)
    if (normalized.id === this.registry.id) this.recompute()
    this.emitChange()
    return normalized
  }

  /** Remove a runtime-registered style (issue #361). See `StyleRegistry.remove`. */
  removeStyle(id: string): boolean {
    const result = this.registry.remove(id)
    if (result === 'unchanged') return false
    if (result === 'removed-active') this.recompute()
    this.emitChange()
    return true
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
    const signature = buildClusterSignature(ordered)
    if (signature === this.lastSignature) return false
    this.lastSignature = signature
    this.clusters = new Map(ordered.map((c) => [c.citationId, c.attrs]))
    this.order = ordered.map((c) => c.citationId)
    this.recompute()
    this.emitChange()
    return true
  }

  /** Last computed in-text/note text for a cluster ('' when unknown/missing). */
  renderCluster(citationId: string): string {
    return this.rendered.get(citationId) ?? ''
  }

  /** Cited-only entries (citeproc-sorted), sanitized HTML strings. */
  getReferenceList(): string[] {
    return this.referenceList
  }

  /** All saved sources (cited + uncited), citeproc-sorted, sanitized HTML. */
  getBibliography(): string[] {
    return this.bibliography
  }

  private emitChange(): void {
    for (const cb of this.listeners) cb()
  }

  /** Replay the document through a fresh engine and swap in the result. */
  private recompute(): void {
    const result = renderCitations({
      styleInfo: this.registry.info,
      sources: this.sources,
      clusters: this.clusters,
      order: this.order,
    })
    this.rendered = result.rendered
    this.referenceList = result.referenceList
    this.bibliography = result.bibliography
  }
}
