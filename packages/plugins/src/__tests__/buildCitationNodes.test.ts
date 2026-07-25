import { describe, it, expect } from 'vitest'
import { CiteEngine } from '../citeEngine.js'
import { buildCitationNodes } from '../citationNodeSpec.js'

/**
 * Pure helper tests (Phase 7E-4 — single source of truth for the note-vs-inline
 * branching). No editor/view — `buildCitationNodes` takes the engine + attrs
 * and returns a node spec, no PM dispatch (the content-array insert path /
 * the interactive `insertCitation` path both call it but the helper itself
 * never mutates the editor).
 */
describe('buildCitationNodes (7E-4)', () => {
  it('returns an inline `citation` spec for an in-text style (APA)', () => {
    const engine = new CiteEngine({ style: 'apa' })
    expect(engine.isNoteStyle()).toBe(false)

    const spec = buildCitationNodes(engine, { sourceId: 'src-1' })
    expect(spec.type).toBe('citation')
    expect(spec.attrs.sourceId).toBe('src-1')
    expect(spec.attrs.locator).toBe('') // locator ?? '' default
    expect(spec.attrs.citationId).toBeTruthy() // a fresh cluster id, not hardcoded
    expect(spec.attrs.citationId).not.toBe('')
  })

  it('honors an explicit locator on the inline path', () => {
    const engine = new CiteEngine({ style: 'apa' })
    const spec = buildCitationNodes(engine, { sourceId: 'src-1', locator: '42' })
    expect(spec.type).toBe('citation')
    expect(spec.attrs.locator).toBe('42')
  })

  it('returns a `footnote` spec for a note style (Chicago notes-bib)', () => {
    const engine = new CiteEngine({ style: 'chicago-notes-bibliography' })
    expect(engine.isNoteStyle()).toBe(true)

    const spec = buildCitationNodes(engine, { sourceId: 'src-2', locator: '12' })
    expect(spec.type).toBe('footnote')
    // `content: ''` is REQUIRED — the engine derives the note body, the body
    // is never stored in the document (phase-6 invariant).
    expect(spec.attrs.content).toBe('')
    expect(spec.attrs.sourceId).toBe('src-2')
    expect(spec.attrs.locator).toBe('12')
    expect(spec.attrs.citationId).toBeTruthy()
  })

  it('defaults locator to "" on the note-style path', () => {
    const engine = new CiteEngine({ style: 'chicago-notes-bibliography' })
    const spec = buildCitationNodes(engine, { sourceId: 'src-3' })
    expect(spec.type).toBe('footnote')
    expect(spec.attrs.locator).toBe('')
  })

  it('does NOT dispatch or mutate the editor — pure (no DOM needed)', () => {
    // If the helper ever regresses to dispatching (e.g. calling a TipTap
    // chain), this test would crash in a headless vitest env (no view); it
    // doubles as a "no editor side effects" guard.
    const engine = new CiteEngine({ style: 'apa' })
    const a = buildCitationNodes(engine, { sourceId: 'x' })
    const b = buildCitationNodes(engine, { sourceId: 'x' })
    // Each call mints a fresh citationId — two separate clusters, not the same.
    expect(a.attrs.citationId).not.toBe(b.attrs.citationId)
  })
})