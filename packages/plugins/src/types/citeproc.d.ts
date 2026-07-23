/**
 * Minimal ambient declarations for citeproc-js (citeproc@2.x, CommonJS, no
 * bundled types). Covers only the API surface the CiteEngine uses. See
 * https://citeproc-js.readthedocs.io/ for the full API.
 */
declare module 'citeproc' {
  export interface CitationItemInput {
    id: string
    locator?: string
    label?: string
    prefix?: string
    suffix?: string
    'suppress-author'?: boolean
    'author-only'?: boolean
  }

  export interface CitationInput {
    citationID: string
    citationItems: CitationItemInput[]
    properties?: {
      noteIndex?: number
      mode?: string
    }
  }

  /** [clusterIndex, renderedText, citationID] */
  export type CitationResultEntry = [number, string, string]

  export interface EngineSys {
    retrieveLocale: (lang: string) => string
    retrieveItem: (id: string) => Record<string, unknown> | undefined
  }

  export interface BibliographyMeta {
    bibstart: string
    bibend: string
    entryspacing?: number
    linespacing?: number
    'second-field-align'?: boolean | string
    hangingindent?: boolean
    maxoffset?: number
  }

  export class Engine {
    constructor(sys: EngineSys, style: string, lang?: string, forceLang?: boolean)

    processCitationCluster(
      citation: CitationInput,
      citationsPre: Array<[string, number]>,
      citationsPost: Array<[string, number]>,
    ): [unknown, CitationResultEntry[]]

    appendCitationCluster(
      citation: CitationInput,
    ): [Array<[string, number]>, CitationResultEntry[], Array<[string, number]>]

    makeBibliography(): [BibliographyMeta, string[]] | false

    updateItems(idList: string[]): void
  }
}
