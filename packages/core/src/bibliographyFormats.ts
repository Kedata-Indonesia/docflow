/**
 * Reference-file formats the editor can hand to a host importer (issue #353).
 *
 * The library still never parses a reference file itself — the host's
 * `onImportBibliography` port does that. What the library owns is deciding
 * *which* format the user picked (extension first, then content sniffing) so a
 * `.enw`/`.json`/`.yaml`/`.xml` file is no longer mislabelled as BibTeX.
 */

export type BibliographyFormat = 'bibtex' | 'ris' | 'enw' | 'csl-json' | 'yaml' | 'xml'

const EXTENSION_TO_FORMAT: Record<string, BibliographyFormat> = {
  bib: 'bibtex',
  bibtex: 'bibtex',
  ris: 'ris',
  enw: 'enw',
  json: 'csl-json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
}

/** `accept` for the reference-file picker — keep the extensions in sync above. */
export const BIBLIOGRAPHY_FILE_ACCEPT =
  '.bib,.ris,.enw,.json,.yaml,.yml,.xml,' +
  'application/x-bibtex,application/x-research-info-systems,text/plain,' +
  'application/json,application/xml,text/xml,application/x-yaml,text/yaml'

/**
 * Detect a reference file's format from its name, falling back to the content
 * when the extension is unknown (or missing). Returns `null` when neither is
 * conclusive, so the caller can report an unsupported file instead of guessing.
 */
export function detectBibliographyFormat(
  filename: string,
  text = '',
): BibliographyFormat | null {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (extension && EXTENSION_TO_FORMAT[extension]) return EXTENSION_TO_FORMAT[extension]

  const head = text.trimStart()
  if (!head) return null
  if (head.startsWith('{') || head.startsWith('[')) return 'csl-json'
  if (head.startsWith('<')) return 'xml'
  // BibTeX comments start with `%` too, so the entry marker decides.
  if (/^@[a-zA-Z]+\s*[{(]/m.test(head)) return 'bibtex'
  if (/^TY\s{0,2}-/m.test(head)) return 'ris'
  if (/^%[0-9A-Z@]\s/m.test(head)) return 'enw'
  if (/^\s*(-\s+)?(id|type)\s*:/m.test(head)) return 'yaml'
  return null
}
