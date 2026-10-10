// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Schema } from 'prosemirror-model'
import { resolveSuggestionDoc, docJsonToHtml } from '../suggestions.js'

/**
 * P4 (#27/#28) — export resolves track-changes suggestions. The schema mirrors
 * the mark names produced by `packages/plugins/src/suggestChanges.ts`.
 */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
    suggestionInsert: { attrs: { suggestionId: {}, authorId: { default: null }, authorName: { default: null }, createdAt: { default: null } }, toDOM: () => ['span', { 'data-suggestion': 'insert' }, 0] },
    suggestionDelete: { attrs: { suggestionId: {}, authorId: { default: null }, authorName: { default: null }, createdAt: { default: null } }, toDOM: () => ['span', { 'data-suggestion': 'delete' }, 0] },
    suggestionFormat: {
      attrs: {
        suggestionId: {},
        authorId: { default: null },
        authorName: { default: null },
        createdAt: { default: null },
        format: { default: null },
        delta: { default: 'add' },
      },
      toDOM: () => ['span', { 'data-suggestion': 'format' }, 0],
    },
  },
})

const insert = schema.marks.suggestionInsert.create({ suggestionId: 's1' })
const del = schema.marks.suggestionDelete.create({ suggestionId: 's2' })
const fmtAdd = schema.marks.suggestionFormat.create({ suggestionId: 's3', format: 'bold', delta: 'add' })
const fmtRemove = schema.marks.suggestionFormat.create({ suggestionId: 's4', format: 'bold', delta: 'remove' })
const bold = schema.marks.bold.create()

const docJson = (marks: Array<{ text: string; marks: import('prosemirror-model').Mark[] }>) =>
  schema
    .node('doc', null, [
      schema.node('paragraph', null, marks.map((m) => schema.text(m.text, m.marks))),
    ])
    .toJSON()

const textOf = (json: object): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (json as any).content?.[0]?.content?.map((n: { text: string }) => n.text).join('') ?? ''

const marksOf = (json: object, text: string): string[] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes = (json as any).content?.[0]?.content ?? []
  const node = nodes.find((n: { text?: string }) => n.text === text)
  return (node?.marks ?? []).map((m: { type: string }) => m.type)
}

describe('resolveSuggestionDoc (P4)', () => {
  const json = docJson([
    { text: 'kept', marks: [insert] },
    { text: 'gone', marks: [del] },
    { text: 'plain', marks: [] },
  ])

  it('accept keeps insertions and drops deletions', () => {
    const resolved = resolveSuggestionDoc(schema, json, 'accept')
    expect(textOf(resolved)).toBe('keptplain')
    expect(marksOf(resolved, 'kept')).toEqual([])
  })

  it('reject drops insertions and keeps deletions', () => {
    const resolved = resolveSuggestionDoc(schema, json, 'reject')
    expect(textOf(resolved)).toBe('goneplain')
    expect(marksOf(resolved, 'gone')).toEqual([])
  })

  it('annotate returns the document unchanged', () => {
    const resolved = resolveSuggestionDoc(schema, json, 'annotate')
    expect(resolved).toEqual(json)
  })

  it('accept applies an "add" format suggestion and clears it', () => {
    const doc = docJson([{ text: 'bold me', marks: [fmtAdd] }])
    const resolved = resolveSuggestionDoc(schema, doc, 'accept')
    expect(marksOf(resolved, 'bold me')).toEqual(['bold'])
  })

  it('accept applies a "remove" format suggestion', () => {
    const doc = docJson([{ text: 'unbold', marks: [bold, fmtRemove] }])
    const resolved = resolveSuggestionDoc(schema, doc, 'accept')
    expect(marksOf(resolved, 'unbold')).toEqual([])
  })

  it('reject leaves formatting untouched and clears the proposal mark', () => {
    const doc = docJson([{ text: 'x', marks: [fmtAdd] }])
    const resolved = resolveSuggestionDoc(schema, doc, 'reject')
    expect(marksOf(resolved, 'x')).toEqual([])
  })
})

describe('docJsonToHtml', () => {
  it('renders resolved text without suggestion markup', () => {
    const json = docJson([
      { text: 'kept', marks: [insert] },
      { text: 'gone', marks: [del] },
    ])
    const html = docJsonToHtml(schema, resolveSuggestionDoc(schema, json, 'accept'))
    expect(html).toContain('kept')
    expect(html).not.toContain('gone')
    expect(html).not.toContain('data-suggestion')
  })

  it('keeps annotation markup for the annotate mode', () => {
    const json = docJson([{ text: 'x', marks: [insert] }])
    // annotate is a pass-through; the raw editor HTML carries the markup.
    expect(resolveSuggestionDoc(schema, json, 'annotate')).toEqual(json)
  })
})
