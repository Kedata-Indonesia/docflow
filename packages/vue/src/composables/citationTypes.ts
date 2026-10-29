import type { Ref } from 'vue'
import type {
  CitationPort,
  CslItemData,
  CslStyleInfo,
  DocsEditor,
} from '@kedata-indonesia/docflow-core'
import type { SidebarKey } from '../types.js'
import type { LocaleContext } from './useLocale.js'

/** The slice of `CiteEngine` this composable talks to. */
export interface CitationEngineLike {
  updateSources: (sources: CslItemData[]) => void
  setStyle: (styleId: string) => void
  /**
   * Styles this engine can render with — bundled + host-injected (issue #180).
   * Optional: older/minimal engines only need the two methods above.
   */
  getAvailableStyles?: () => { id: string; name: string }[]
  /**
   * Register a style at runtime (issue #251, the `.csl` import path). Optional:
   * minimal/older engines can still render, they just cannot import files.
   */
  registerStyle?: (style: CslStyleInfo) => CslStyleInfo
  /**
   * Remove a runtime-registered style (issue #361). Optional for the same
   * reason as `registerStyle`.
   */
  removeStyle?: (styleId: string) => boolean
}

/**
 * One entry in the Citation Style picker. `removable` marks the styles the
 * user imported — the bundled four are the offline fallback and cannot be
 * deleted (issue #361).
 */
export interface CitationStyleOption {
  id: string
  name: string
  removable: boolean
}

/**
 * The four styles the library bundles. Used as the picker's fallback before an
 * engine exists; once one does, the list comes from `getAvailableStyles()` so a
 * host-injected style shows up without touching the library (issue #180).
 */
export const BUNDLED_REFERENCE_STYLES: { id: string; name: string }[] = [
  { id: 'chicago-notes-bibliography', name: 'Chicago (notes & bibliography)' },
  { id: 'chicago-author-date', name: 'Chicago (author-date)' },
  { id: 'apa', name: 'APA' },
  { id: 'modern-language-association', name: 'MLA' },
]

/** Ids of the bundled four — anything else in the engine was user-imported. */
export const BUNDLED_STYLE_IDS = new Set(BUNDLED_REFERENCE_STYLES.map((style) => style.id))

/** The picker fallback: bundled styles, none of them removable. */
export const bundledStyleOptions = (): CitationStyleOption[] =>
  BUNDLED_REFERENCE_STYLES.map((style) => ({ ...style, removable: false }))

/** Events emitted by the citation surface. */
export interface CitationsEmit {
  (event: 'citation-sources-change', sources: CslItemData[]): void
  (event: 'update:citation-style', style: string): void
  /** Issue #251 — a `.csl` file was imported; hosts persist + re-supply `citation.styles`. */
  (event: 'citation-style-imported', style: CslStyleInfo): void
  /** Issue #361 — an imported style was removed; hosts drop it from persistence. */
  (event: 'citation-style-removed', styleId: string): void
}

export interface UseCitationsOptions {
  /** The editor is created after this composable; read it lazily. */
  getEditor: () => DocsEditor['editor'] | null
  /** Plugin actions are read lazily for the fallback citation insert. */
  getPluginActions: () => DocsEditor['pluginActions']
  /** The host citation port is read lazily so the port stays current. */
  getCitation: () => CitationPort | undefined
  emit: CitationsEmit
  t: LocaleContext['t']
  activeSidebar: Ref<SidebarKey | null>
}
