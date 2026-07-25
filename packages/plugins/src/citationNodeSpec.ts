/**
 * Pure citation-node spec builder — NO tiptap imports. Lives apart from
 * `citation.ts` so the standalone `citations.ts` entrypoint (server-side
 * export bundle, see `apps/server/src/routes/export.ts`) can re-export it
 * WITHOUT pulling the editor extension graph into the server bundle.
 *
 * Two consumers:
 *   - `citation.ts` `insertCitationWithSource` (dispatches its OWN transaction
 *     per interactive insert, Phase 6 behavior unchanged).
 *   - The 7E-4 sidebar content-array insert path, which builds N specs and
 *     dispatches ONCE via `view.dispatch(tr.insertContent(array))` (the plan
 *     §2 decision 6 — N markers must NOT become N transactions / N Yjs
 *     history entries).
 *
 * The helper is the single source of truth for the note-vs-inline branching
 * so the sidebar does not duplicate it.
 */
import { nextCitationId, type CiteEngine } from './citeEngine.js'

export type CitationNodeSpec = {
  type: 'footnote' | 'citation'
  attrs: Record<string, unknown>
}

/**
 * Build ONE citation node spec (inline `citation` or note-style `footnote`)
 * WITHOUT dispatching. Returns `null` only if the engine is missing the
 * schema primitive — `insertCitationWithSource` additionally guards against
 * `editor.schema.nodes['footnote']` being absent since the helper itself
 * cannot reach the schema.
 *
 * PURE: takes the engine + attrs, returns a node spec, no editor mutation.
 */
export function buildCitationNodes(
  engine: CiteEngine,
  attrs: { sourceId: string; locator?: string },
): CitationNodeSpec {
  const citationId = nextCitationId()
  if (engine.isNoteStyle()) {
    // Note styles (Chicago notes-bib) cite via footnotes — the engine
    // renders the note body, the existing DOM pass numbers the ref.
    // `content: ''` is REQUIRED — the engine derives the body, never stored.
    return {
      type: 'footnote',
      attrs: { content: '', sourceId: attrs.sourceId, locator: attrs.locator ?? '', citationId },
    }
  }
  return {
    type: 'citation',
    attrs: { citationId, sourceId: attrs.sourceId, locator: attrs.locator ?? '' },
  }
}