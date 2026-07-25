import { describe, it, expect } from 'vitest'
import type { AIDraftCitation } from '@kedata-indonesia/docflow-core'
import type { CiteEngine } from '@kedata-indonesia/docflow-plugins'
import { buildContentArray, stripMarkers } from '../components/sidebars/markerGrammar.js'

/**
 * Pure marker-grammar tests (Phase 7E-4 — the §4 7E-4 acceptance suite for
 * the pinned grammar). No Vue, no editor — `buildContentArray` walks the
 * streamed DRAFT text against the citation table and packs one element per
 * marker / text span. The stub engine mimics CiteEngine's `isNoteStyle()`
 * (the only surface `buildCitationNodes` touches) so the helper's note-vs-
 * inline branching flows through.
 *
 * Pinned cases (plan §4): basic [1]; adjacent [1][2] → two nodes;
 * unresolved [9] stripped; `[[1]]` → one inner node; `[^1]` left literal.
 */
function stubEngine(isNote: boolean): CiteEngine {
  return { isNoteStyle: () => isNote } as unknown as CiteEngine
}

function cite(ref: number, sourceId: string): AIDraftCitation {
  return { ref, sourceId, label: `Label ${ref}` }
}

describe('markerGrammar (7E-4)', () => {
  it('[1] basic → [text, citation, text]', () => {
    const table = new Map([[1, cite(1, 's1')]])
    const parts = buildContentArray('Hello [1] world', table, stubEngine(false))
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('Hello ')
    expect(typeof parts[1]).toBe('object')
    const node = parts[1] as { type: string; attrs: Record<string, unknown> }
    expect(node.type).toBe('citation')
    expect(node.attrs.sourceId).toBe('s1')
    expect(node.attrs.locator).toBe('') // MVP — no locator emitted
    expect(parts[2]).toBe(' world')
  })

  it('adjacent [1][2] → two citation nodes, no range expansion', () => {
    const table = new Map([
      [1, cite(1, 's1')],
      [2, cite(2, 's2')],
    ])
    const parts = buildContentArray('see [1][2] here', table, stubEngine(false))
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('see ')
    expect((parts[1] as { type: string }).type).toBe('citation')
    expect((parts[2] as { type: string }).type).toBe('citation')
    expect(parts[3]).toBe(' here')
    expect((parts[1] as { attrs: Record<string, unknown> }).attrs.sourceId).toBe('s1')
    expect((parts[2] as { attrs: Record<string, unknown> }).attrs.sourceId).toBe('s2')
  })

  it('unresolved marker [9] is STRIPPED (deleted, not left literal)', () => {
    const table = new Map<number, AIDraftCitation>([]) // empty → nothing resolves
    const parts = buildContentArray('Hello [9] world', table, stubEngine(false))
    // The marker substring `[9]` is dropped (not pushed as a literal), but
    // the surrounding text still lands as spans before/after — those spans
    // would concatenate back together on insertContent exactly as if the
    // marker had been deleted. Two slices here; combined = "Hello  world"
    // (the double space is the marker's footprint removed).
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('Hello ')
    expect(parts[1]).toBe(' world')
    expect(parts.join('')).toBe('Hello  world')
    parts.forEach((p) =>
      expect(typeof p === 'string' ? p : (p as { type: string }).type).not.toBe('citation'),
    )
  })

  it('[[1]] → ONE inner node (outer brackets become surrounding literal)', () => {
    const table = new Map([[1, cite(1, 's1')]])
    const parts = buildContentArray('prefix [[1]] suffix', table, stubEngine(false))
    // The outer `[` is captured in the preceding span, the outer `]` rides
    // along in the trailing span — ONE inner citation node, no double match.
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('prefix [')
    expect((parts[1] as { type: string }).type).toBe('citation')
    expect(parts[2]).toBe('] suffix')
  })

  it('[^1] → left LITERAL (`^` breaks the capture)', () => {
    const table = new Map([[1, cite(1, 's1')]])
    const parts = buildContentArray('note [^1] here', table, stubEngine(false))
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('note [^1] here')
  })

  it('[1-3] → left LITERAL (`1-3` is not a valid `\\d{1,3}` capture)', () => {
    const table = new Map<number, AIDraftCitation>([])
    const parts = buildContentArray('range [1-3] here', table, stubEngine(false))
    expect(parts).toHaveLength(1)
    expect(parts[0]).toBe('range [1-3] here')
  })

  it('no markers → single trailing text span', () => {
    const table = new Map<number, AIDraftCitation>([])
    const parts = buildContentArray('plain text with no cites', table, stubEngine(false))
    expect(parts).toEqual(['plain text with no cites'])
  })

  it('note engine → markers map to `footnote` specs (engine drives branching)', () => {
    const table = new Map([[1, cite(1, 's1')]])
    const parts = buildContentArray('a [1] b', table, stubEngine(true))
    expect(parts).toHaveLength(3)
    const node = parts[1] as { type: string; attrs: Record<string, unknown> }
    expect(node.type).toBe('footnote')
    expect(node.attrs.sourceId).toBe('s1')
    expect(node.attrs.content).toBe('') // the engine derives the body, never stored
  })

  it('stripMarkers removes every [n] (resolved OR unresolved)', () => {
    expect(stripMarkers('a [1] b [9] c')).toBe('a  b  c')
    expect(stripMarkers('[1][2]')).toBe('')
    expect(stripMarkers('[[1]]')).toBe('[]') // inner stripped, outer brackets literal
    expect(stripMarkers('[^1]')).toBe('[^1]') // untouched — not a marker
  })

  it('re-entrancy: the g-flag regex does not leak lastIndex across calls', () => {
    const table = new Map([[1, cite(1, 's1')]])
    const first = buildContentArray('x [1] y [1] z', table, stubEngine(false))
    // Run again on a shorter input — if lastIndex carried over, the run
    // would miss the marker. Verifies the `MARKER_RE.lastIndex = 0` reset.
    const second = buildContentArray('a [1] b', table, stubEngine(false))
    expect((second[1] as { type: string }).type).toBe('citation')
    // sanity: the first run had two citations
    expect(first.filter((p) => typeof p !== 'string')).toHaveLength(2)
  })
})