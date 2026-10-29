import { describe, expect, it } from 'vitest'
import type { BlockInfo, LayoutResult, Page } from '../types'
import { computeBlockHashes, computeDocHash } from '../layout/layoutFingerprint'
import { mergeIncrementalPages } from '../layout/incrementalPages'

/**
 * Internals extracted out of `PageLayout`: the cache fingerprint and the
 * head-page reuse rule. Both decide whether downstream consumers redraw, so
 * they are pinned directly instead of only through a full layout run.
 */

function container(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

function block(from: number, to: number): BlockInfo {
  return { nodeType: 'paragraph', from, to, top: 0, bottom: 10, canSplit: true }
}

/** A page whose single block ends where the page ends. */
function page(from: number, to: number): Page {
  return { from, to, blocks: [block(from, to)] }
}

describe('layout fingerprints', () => {
  it('changes when a block text changes', () => {
    const el = container('<div data-node-type="paragraph" data-from="0">Hello</div>')
    const before = computeDocHash(el)
    el.firstElementChild!.textContent = 'Hello world'
    expect(computeDocHash(el)).not.toBe(before)
  })

  it('keys every DOM child, matching the block index', () => {
    const el = container(
      '<div data-from="0">a</div><div data-from="1">b</div><div data-from="2">c</div>',
    )
    const hashes = computeBlockHashes(el)
    expect([...hashes.keys()]).toEqual([0, 1, 2])
    expect(hashes.get(1)).toContain('b')
  })
})

describe('mergeIncrementalPages', () => {
  const previousPages = [page(0, 10), page(10, 20), page(20, 30)]
  const blocks = [block(0, 10), block(10, 20), block(20, 30)]

  function previous(): LayoutResult {
    return { pages: previousPages, invalidatedAt: 1 }
  }

  it('reuses unchanged head pages when only the tail changed', () => {
    const allPages = [page(0, 10), page(10, 20), page(20, 40)]
    const result = mergeIncrementalPages({
      allPages,
      previous: previous(),
      containerChanged: false,
      previousBlockHashes: new Map([
        [0, 'a'],
        [1, 'b'],
        [2, 'c'],
      ]),
      blockHashes: new Map([
        [0, 'a'],
        [1, 'b'],
        [2, 'CHANGED'],
      ]),
      blocks,
    })

    expect(result).toHaveLength(3)
    expect(result[0]).toBe(previousPages[0])
    expect(result[2]).toBe(allPages[2])
  })

  it('keeps the previous result when nothing changed', () => {
    const allPages = [page(0, 10), page(10, 20), page(20, 30)]
    const sameHashes = new Map([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ])
    const result = mergeIncrementalPages({
      allPages,
      previous: previous(),
      containerChanged: false,
      previousBlockHashes: sameHashes,
      blockHashes: sameHashes,
      blocks,
    })

    expect(result).toBe(allPages)
  })

  it('never reuses pages after a container resize', () => {
    const allPages = [page(0, 12), page(12, 24)]
    const result = mergeIncrementalPages({
      allPages,
      previous: previous(),
      containerChanged: true,
      previousBlockHashes: new Map([[0, 'a']]),
      blockHashes: new Map([[0, 'b']]),
      blocks,
    })

    expect(result).toBe(allPages)
  })

  it('falls back to every new page when the reused boundary moved', () => {
    const allPages = [page(0, 12), page(12, 20), page(20, 40)]
    const result = mergeIncrementalPages({
      allPages,
      previous: previous(),
      containerChanged: false,
      previousBlockHashes: new Map([
        [0, 'a'],
        [1, 'b'],
        [2, 'c'],
      ]),
      blockHashes: new Map([
        [0, 'a'],
        [1, 'b'],
        [2, 'd'],
      ]),
      blocks,
    })

    expect(result).toBe(allPages)
  })

  it('treats an appended block as a tail change', () => {
    const allPages = [page(0, 10), page(10, 20), page(20, 30)]
    const result = mergeIncrementalPages({
      allPages,
      previous: previous(),
      containerChanged: false,
      previousBlockHashes: new Map([
        [0, 'a'],
        [1, 'b'],
      ]),
      blockHashes: new Map([
        [0, 'a'],
        [1, 'b'],
        [2, 'c'],
      ]),
      blocks,
    })

    expect(result[0]).toBe(previousPages[0])
    expect(result).toHaveLength(3)
  })

  it('returns the new pages on the first run', () => {
    const allPages = [page(0, 10)]
    const result = mergeIncrementalPages({
      allPages,
      previous: null,
      containerChanged: false,
      previousBlockHashes: new Map(),
      blockHashes: new Map([[0, 'a']]),
      blocks,
    })

    expect(result).toBe(allPages)
  })
})
