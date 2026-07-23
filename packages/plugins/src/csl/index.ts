import chicagoNotesBibliography from './chicagoNotesBibliography.js'
import chicagoAuthorDate from './chicagoAuthorDate.js'
import apa from './apa.js'
import modernLanguageAssociation from './modernLanguageAssociation.js'
import localesEnUS from './localesEnUS.js'

export interface CslStyleInfo {
  id: string
  name: string
  /** 'note' styles render citations as footnotes; 'in-text' render inline. */
  category: 'note' | 'in-text'
  xml: string
}

/**
 * CSL styles bundled with the citation engine. Bundling (instead of runtime
 * fetch) keeps the editor standalone/offline-capable — the same guarantee the
 * embedded source snapshot provides (see phase-6 plan §2 decision 5).
 */
export const CSL_STYLES: Record<string, CslStyleInfo> = {
  'chicago-notes-bibliography': {
    id: 'chicago-notes-bibliography',
    name: 'Chicago (notes & bibliography)',
    category: 'note',
    xml: chicagoNotesBibliography,
  },
  'chicago-author-date': {
    id: 'chicago-author-date',
    name: 'Chicago (author-date)',
    category: 'in-text',
    xml: chicagoAuthorDate,
  },
  apa: {
    id: 'apa',
    name: 'APA',
    category: 'in-text',
    xml: apa,
  },
  'modern-language-association': {
    id: 'modern-language-association',
    name: 'MLA',
    category: 'in-text',
    xml: modernLanguageAssociation,
  },
}

export const DEFAULT_CSL_STYLE = 'chicago-notes-bibliography'

/** The single bundled locale. Multi-locale rendering is deferred (phase 6 §7). */
export const CSL_LOCALE_EN_US: string = localesEnUS
