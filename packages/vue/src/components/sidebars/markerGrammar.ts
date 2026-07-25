/**
 * Marker grammar for the cited-draft insert path (Phase 7E-4).
 *
 * PURE — no Vue, no ProseMirror, no editor/DOM mutation. Lives apart from
 * `AISidebar.vue` so the §4 7E-4 acceptance tests can drive the grammar
 * directly (basic, adjacent, unresolved-stripped, `[[1]]`-inner, `[^1]`
 * literal) without mounting the component.
 *
 * Pinned grammar (plan §4 7E-4 final, bug-hunter-reviewed): match
 * `/\[(\d{1,3})\]/g` over the streamed DRAFT text; for each captured `n`:
 *   - if `tableByRef.has(n)` → push the preceding text span, then push the
 *     citation node spec from `buildCitationNodes(engine, { sourceId })`
 *     (NO locator for MVP — the model doesn't emit locators; the existing
 *     Phase 6 `insertCitation` paths still let a user add locators later);
 *   - if NOT in table → STRIP the marker (drop the surrounding text but keep
 *     the marker-substring deleted — never left as a literal `[9]`).
 *
 * Edge cases:
 *   - `[[1]]` → regex matches the INNER `[1]` (one node; the outer brackets
 *     become surrounding literal text — `[` before, `]` after).
 *   - `[1-3]` → left literal (`1-3` is not a `\d{1,3}` capture).
 *   - `[^1]` → left literal (`[^` not `[\[`).
 *   - adjacent `[1][2]` → TWO nodes, no range expansion.
 *   - no markers in text → a single trailing text span.
 *
 * Returns a ProseMirror `insertContent`-compatible array: a mix of plain
 * strings (text spans) and node specs `{ type: 'citation'|'footnote',
 * attrs: {...} }`. ProseMirror's `tr.insertContent` accepts this mixed
 * shape exactly as `editor.commands.insertContent` does (the existing
 * `insertCitationWithSource` already passes single-element arrays of
 * `{type:'citation', attrs}` through `insertContent`).
 */
import { buildCitationNodes, type CiteEngine } from '@kedata-indonesia/docflow-plugins'
import type { AIDraftCitation } from '@kedata-indonesia/docflow-core'

/** The minimal CiteEngine surface used by `buildCitationNodes`. Kept as a
 *  structural type so unit tests can pass a stub without instantiating the
 *  real `CiteEngine` (which pulls citeproc) — cast `as unknown as CiteEngine`
 *  at the call site. The sidebar passes the live engine from
 *  `getCitationEngine(editor)`. */
export interface CiteEngineLike {
  isNoteStyle(): boolean
}

/** The node spec returned by `buildCitationNodes`. */
export type CitationNodeSpec = ReturnType<typeof buildCitationNodes>

export type ContentPart = string | CitationNodeSpec

const MARKER_RE = /\[(\d{1,3})\]/g

/**
 * Strip every `[n]` marker (resolved OR unresolved) from the text. Used by
 * the no-engine fallback in `AISidebar.handleInsert` so a draft with markers
 * but no citation engine still inserts clean text (no leak, no literal `[9]`).
 */
export function stripMarkers(text: string): string {
  return text.replace(MARKER_RE, '')
}

/**
 * Build a `content` array for `view.dispatch(state.tr.insertContent(array))`.
 * Walks `text` once over `MARKER_RE`, splitting on resolved markers into
 * `[textSpan, citationNode, textSpan, …]`. Unresolved markers are stripped
 * (their substring is deleted, not left literal). The engine drives the
 * note-vs-inline node construction via the shared `buildCitationNodes` helper
 * (single source of truth — the sidebar does NOT duplicate the branching).
 */
export function buildContentArray(
  text: string,
  tableByRef: Map<number, AIDraftCitation>,
  engine: CiteEngine,
): ContentPart[] {
  const parts: ContentPart[] = []
  let lastIdx = 0
  // Reset lastIndex — `MARKER_RE` is a module-level `g` flag constant, so it
  // carries lastIndex across calls (stateful regex pitfall).
  MARKER_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKER_RE.exec(text)) !== null) {
    const ref = Number(match[1])
    const citation = tableByRef.get(ref)
    const preceding = text.slice(lastIdx, match.index)
    // Always push the text BEFORE this match — it is part of the output
    // whether the marker resolves or not (the `[[1]]` case: the outer `[`
    // lives in the preceding span and stays literal).
    if (preceding) parts.push(preceding)
    if (!citation) {
      // Unresolved: drop the marker substring entirely (never push `[9]`
      // as a literal). Advance `lastIdx` past the marker so the next
      // span / trailing slice picks up the text AFTER it — surrounding
      // text continues uninterrupted (the §4 7E-4 "strip unresolved" rule).
      lastIdx = match.index + match[0].length
      continue
    }
    parts.push(buildCitationNodes(engine, { sourceId: citation.sourceId }))
    lastIdx = match.index + match[0].length
  }
  const trailing = text.slice(lastIdx)
  if (trailing) parts.push(trailing)
  return parts
}