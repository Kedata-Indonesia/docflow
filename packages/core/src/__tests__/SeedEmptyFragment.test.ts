import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import {
  seedEmptyFragment,
  PROVISIONAL_SEED_ORIGIN,
  type EmptyFragmentSeed,
} from '../collab/seedEmptyFragment.js'

function textOf(element: Y.XmlElement): string {
  let out = ''
  element.toArray().forEach((child) => {
    if (child instanceof Y.XmlText) out += child.toString()
  })
  return out
}

function paragraphWithText(text: string): Y.XmlElement {
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(text)])
  return p
}

function makeSeed(doc: Y.Doc): { fragment: Y.XmlFragment; seed: EmptyFragmentSeed } {
  const fragment = doc.getXmlFragment('default')
  const seed = seedEmptyFragment(doc)
  return { fragment, seed }
}

function deliverRemoteContent(doc: Y.Doc, paragraphs: Y.XmlElement[]): void {
  const remoteDoc = new Y.Doc()
  const remoteFragment = remoteDoc.getXmlFragment('default')
  remoteFragment.insert(0, paragraphs)
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(remoteDoc))
}

describe('seedEmptyFragment', () => {
  it('seeds a pristine empty paragraph into an empty fragment', () => {
    const doc = new Y.Doc()
    const { fragment, seed } = makeSeed(doc)

    expect(seed.seeded).toBe(true)
    expect(fragment.length).toBe(1)
    const el = fragment.get(0) as Y.XmlElement
    expect(el.nodeName).toBe('paragraph')
    expect(el.length).toBe(0)
    expect(Object.keys(el.getAttributes()).length).toBe(0)

    seed.dispose()
    doc.destroy()
  })

  it('does not seed when the fragment already has content', () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('default')
    fragment.insert(0, [paragraphWithText('existing')])

    const seed = seedEmptyFragment(doc)
    expect(seed.seeded).toBe(false)
    expect(fragment.length).toBe(1)

    seed.dispose()
    doc.destroy()
  })

  it('reconciles the provisional paragraph away once remote content arrives', () => {
    const doc = new Y.Doc()
    const { fragment, seed } = makeSeed(doc)
    expect(fragment.length).toBe(1)

    // Simulate the server/provider delivering an existing document.
    deliverRemoteContent(doc, [paragraphWithText('Remote heading')])

    // The provisional paragraph must have been stepped aside.
    expect(fragment.length).toBe(1)
    const el = fragment.get(0) as Y.XmlElement
    expect(el.nodeName).toBe('paragraph')
    expect(textOf(el)).toBe('Remote heading')

    seed.dispose()
    doc.destroy()
  })

  it('keeps the provisional paragraph once the user has typed into it', () => {
    const doc = new Y.Doc()
    const { fragment, seed } = makeSeed(doc)
    const provisional = fragment.get(0) as Y.XmlElement

    // Simulate the user's first keystroke (mirrored into Yjs by
    // y-prosemirror with a non-seed origin).
    provisional.insert(0, [new Y.XmlText('My draft')])

    deliverRemoteContent(doc, [paragraphWithText('Server content')])

    // Real user content is kept; server content merges alongside it (order is
    // decided by Yjs item ordering, so assert on the content set).
    expect(fragment.length).toBe(2)
    const texts = fragment.toArray().map((child) => textOf(child as Y.XmlElement))
    expect(texts).toContain('My draft')
    expect(texts).toContain('Server content')

    seed.dispose()
    doc.destroy()
  })

  it('handles successive remote updates without looping', () => {
    const doc = new Y.Doc()
    const { fragment, seed } = makeSeed(doc)

    // One remote replica whose state grows over time (like a real provider).
    const remoteDoc = new Y.Doc()
    const remoteFragment = remoteDoc.getXmlFragment('default')

    remoteFragment.insert(0, [paragraphWithText('First')])
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remoteDoc))
    expect(fragment.length).toBe(1)
    expect(textOf(fragment.get(0) as Y.XmlElement)).toBe('First')

    remoteFragment.insert(1, [paragraphWithText('Second')])
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remoteDoc))

    expect(fragment.length).toBe(2)
    const texts = fragment.toArray().map((child) => textOf(child as Y.XmlElement))
    expect(texts).toEqual(['First', 'Second'])

    seed.dispose()
    doc.destroy()
  })

  it('dispose() stops reconciliation (observer unregistered)', () => {
    const doc = new Y.Doc()
    const { fragment, seed } = makeSeed(doc)
    seed.dispose()

    // With the observer gone, remote content is merged but the provisional
    // paragraph is no longer removed.
    deliverRemoteContent(doc, [paragraphWithText('Server content')])

    expect(fragment.length).toBe(2)

    doc.destroy()
  })

  it('exports a stable origin marker', () => {
    expect(PROVISIONAL_SEED_ORIGIN).toBe('docflow:provisional-seed')
  })
})
