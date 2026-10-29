import type { CslItemData, CslStyleInfo } from '@kedata-indonesia/docflow-core'

/**
 * Public type surface of the citation engine. Kept in its own module so the
 * renderer, the styles registry and the Tiptap layer can share it without
 * pulling citeproc (a CommonJS dependency) into their module graph.
 */

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
  /**
   * Extra CSL styles for this engine (issue #180). A style whose `id` matches a
   * bundled one **overrides** it; every other id is added alongside the four
   * defaults. Omitting this keeps the previous behaviour exactly (offline
   * bundled styles), and an unknown `style` id always falls back to
   * `DEFAULT_CSL_STYLE` instead of throwing.
   */
  styles?: CslStyleInfo[]
}

export interface CitationCluster {
  citationId: string
  attrs: CitationAttrs
}

export type ChangeListener = () => void
