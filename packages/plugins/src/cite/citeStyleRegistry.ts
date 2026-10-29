import type { CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { DEFAULT_CSL_STYLE } from '../csl/index.js'
import {
  assertCiteprocParses,
  isBundledStyleId,
  normalizeRegisteredStyle,
  resolveCslStyles,
} from './citeStyles.js'

export interface StyleRegistryOptions {
  /** Extra styles for this engine (issue #180), merged over the bundled ones. */
  styles?: CslStyleInfo[]
  /** Requested active style; an unknown id falls back to the default. */
  style?: string
}

/** Outcome of `remove` — tells the caller whether a repaint is needed. */
export type RemoveStyleResult = 'removed' | 'removed-active' | 'unchanged'

/**
 * Bookkeeping for "which CSL styles can this engine render with, and which one
 * is active".
 *
 * Deliberately free of rendering: it validates and normalizes entries, decides
 * the active style and enforces the bundled-style protection, so `CiteEngine`
 * only has to repaint when something actually changed.
 */
export class StyleRegistry {
  private readonly styles: Record<string, CslStyleInfo>
  private active: string

  constructor(options: StyleRegistryOptions = {}) {
    this.styles = resolveCslStyles(options.styles)
    // An unknown id falls back to the default rather than throwing: the style
    // can arrive from a persisted document written by a host that had more
    // styles than this one does.
    this.active = options.style && this.styles[options.style] ? options.style : DEFAULT_CSL_STYLE
  }

  /** Id of the active style. */
  get id(): string {
    return this.active
  }

  /** Full entry for the active style. */
  get info(): CslStyleInfo {
    return this.styles[this.active]
  }

  /** 'note' styles (Chicago notes-bib) cite via footnotes; 'in-text' inline. */
  get isNote(): boolean {
    return this.styles[this.active]?.category === 'note'
  }

  /** Every style this engine can render with, bundled + host-injected. */
  list(): CslStyleInfo[] {
    return Object.values(this.styles).sort((a, b) => a.id.localeCompare(b.id))
  }

  /** Activate `styleId`; returns false when unknown or already active. */
  setActive(styleId: string): boolean {
    if (!this.styles[styleId] || styleId === this.active) return false
    this.active = styleId
    return true
  }

  /**
   * Register a CSL style at runtime (issue #251) — the import-file path. The XML
   * is validated by citeproc *before* the registry is touched, so a malformed
   * file can never break an open document.
   *
   * An id that already exists **replaces** that entry, the same rule as
   * `CitationPort.styles` / `CiteEngineOptions.styles` (issue #180). Returns the
   * normalized style (trimmed id, name fallback, category default).
   */
  register(style: CslStyleInfo): CslStyleInfo {
    const normalized = normalizeRegisteredStyle(style)
    assertCiteprocParses(normalized.id, normalized.xml)
    this.styles[normalized.id] = normalized
    return normalized
  }

  /**
   * Remove a style registered at runtime (issue #361) — the counterpart of
   * `register`, for the `.csl` import path.
   *
   * Bundled styles cannot be removed: they are the offline fallback every
   * document can name, and the engine has to keep rendering them. Removing the
   * active style falls back to `DEFAULT_CSL_STYLE` so the document never keeps
   * pointing at a style that is gone.
   */
  remove(id: string): RemoveStyleResult {
    const styleId = typeof id === 'string' ? id.trim() : ''
    if (!styleId) return 'unchanged'
    if (isBundledStyleId(styleId)) return 'unchanged'
    if (!Object.prototype.hasOwnProperty.call(this.styles, styleId)) return 'unchanged'

    delete this.styles[styleId]
    if (this.active !== styleId) return 'removed'

    this.active = DEFAULT_CSL_STYLE
    return 'removed-active'
  }
}
