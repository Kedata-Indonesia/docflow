/**
 * Injectable ports — the narrow interfaces through which the library reaches
 * host-provided backend capabilities (storage, persistence, …). The library
 * declares them; the host app implements them. See docs/LIBRARY_CONTRACT.md.
 */

export interface ImageUploadResult {
  /** Resolved URL/href the host stored the file at. */
  src: string
  alt?: string
  title?: string
}

/**
 * Host-supplied image upload handler. Called with the file picked by the user;
 * resolves to the stored location to insert into the document. Reject to abort
 * the insert (the failure is logged, nothing is inserted).
 */
export type ImageUploadHandler = (file: File) => Promise<ImageUploadResult>

// ─── Citations (Phase 6) ──────────────────────────────────────────────────────

/** CSL-JSON name (see https://citeproc-js.readthedocs.io/csl-json/). */
export interface CslName {
  family?: string
  given?: string
  literal?: string
}

/** CSL-JSON date. */
export interface CslDate {
  'date-parts'?: number[][]
  raw?: string
  literal?: string
}

/**
 * A CSL-JSON item — the structured source metadata citeproc-js consumes.
 * Nodes store only `{ sourceId, locator }`; all rendered text is derived from
 * this data by the citation engine (never persisted in the document).
 */
export interface CslItemData {
  id: string
  type: string
  title?: string
  author?: CslName[]
  editor?: CslName[]
  issued?: CslDate
  'container-title'?: string
  publisher?: string
  'publisher-place'?: string
  page?: string
  volume?: string
  issue?: string
  DOI?: string
  URL?: string
  ISBN?: string
  abstract?: string
  [k: string]: unknown
}

/**
 * Host-supplied citation port. The library never fetches sources itself — the
 * host owns the reference library and injects CSL-JSON through this port,
 * mirroring the `onImageUpload` injection pattern.
 */
export interface CitationPort {
  /** CSL-JSON provider — a snapshot array or a getter for live data. */
  sources: CslItemData[] | (() => CslItemData[])
  /** Active CSL style id (e.g. 'chicago-notes-bibliography'). */
  style?: string
  /**
   * Called when the user inserts a citation: the host opens its source
   * picker and resolves with the chosen source id (null = cancelled).
   */
  onSourceRequest?: () => Promise<string | null>
  /**
   * Called when the set of cited source ids changes, so the host can update
   * its embedded per-document source snapshot.
   */
  onSourcesChange?: (ids: string[]) => void
  /**
   * Optional importer (Phase 6C-2): resolve a DOI/URL into a new persisted
   * source via the host's backend (CrossRef lookup). Returns the created
   * (or deduplicated) source, null on failure.
   */
  onImportDoi?: (doi: string) => Promise<CslItemData | null>
  /**
   * Optional importer (Phase 6C-3): parse + persist a BibTeX/RIS document
   * via the host's backend. Returns the imported sources and how many
   * entries failed.
   */
  onImportBibliography?: (payload: {
    format: 'bibtex' | 'ris'
    text: string
  }) => Promise<{ imported: CslItemData[]; failed: number }>
}
