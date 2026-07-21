import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '../Editor.js'
import {
  getSearchState,
  setSearchQuery,
  clearSearch,
  searchNext,
  searchPrev,
  replaceCurrent,
  replaceAll,
} from '../SearchAndReplace.js'

const CONTENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world. hello HELLO again.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second hello here.' }] },
  ],
}

describe('SearchAndReplace', () => {
  let target: HTMLDivElement
  let instance: ReturnType<typeof createEditor>

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    instance = createEditor({ target, content: CONTENT })
  })

  afterEach(() => {
    instance.destroy()
    target.remove()
  })

  it('finds all case-insensitive matches with correct positions', () => {
    setSearchQuery(instance.editor, 'hello')
    const s = getSearchState(instance.editor)
    expect(s.matches).toHaveLength(4)
    for (const m of s.matches) {
      expect(m.to - m.from).toBe(5)
      expect(instance.editor.state.doc.textBetween(m.from, m.to).toLowerCase()).toBe('hello')
    }
  })

  it('collects non-overlapping matches so replace-all is stable', () => {
    instance.editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'aaa' }] }],
    })
    setSearchQuery(instance.editor, 'aa')
    expect(getSearchState(instance.editor).matches).toHaveLength(1)
  })

  it('navigates next/prev with wrap-around and selects the active match', () => {
    setSearchQuery(instance.editor, 'hello')
    searchNext(instance.editor)
    expect(getSearchState(instance.editor).activeIndex).toBe(1)
    searchPrev(instance.editor)
    searchPrev(instance.editor) // wraps around to the last match
    const s = getSearchState(instance.editor)
    expect(s.activeIndex).toBe(3)
    const match = s.matches[3]
    const { from, to } = instance.editor.state.selection
    expect(from).toBe(match.from)
    expect(to).toBe(match.to)
  })

  it('highlights matches with decorations (exactly one active)', () => {
    setSearchQuery(instance.editor, 'hello')
    expect(target.querySelectorAll('.find-match').length).toBe(4)
    expect(target.querySelectorAll('.find-match-active').length).toBe(1)
  })

  it('replaceCurrent replaces only the active match and recomputes', () => {
    setSearchQuery(instance.editor, 'hello')
    expect(replaceCurrent(instance.editor, 'hi')).toBe(true)
    expect(instance.editor.getText()).toContain('hi world.')
    expect(getSearchState(instance.editor).matches).toHaveLength(3)
  })

  it('replaceAll replaces every match in one transaction', () => {
    setSearchQuery(instance.editor, 'hello')
    const count = replaceAll(instance.editor, 'bye')
    expect(count).toBe(4)
    expect(instance.editor.getText()).not.toMatch(/hello/i)
    expect(getSearchState(instance.editor).matches).toHaveLength(0)
  })

  it('remaps matches automatically when the doc changes', () => {
    setSearchQuery(instance.editor, 'hello')
    instance.editor.commands.insertContent(' hello again')
    expect(getSearchState(instance.editor).matches.length).toBe(5)
  })

  it('clearSearch empties the state and removes highlights', () => {
    setSearchQuery(instance.editor, 'hello')
    clearSearch(instance.editor)
    expect(getSearchState(instance.editor).matches).toHaveLength(0)
    expect(target.querySelectorAll('.find-match').length).toBe(0)
  })
})
