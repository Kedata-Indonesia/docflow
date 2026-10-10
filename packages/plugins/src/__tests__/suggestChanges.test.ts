import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '../index.js'
import {
  SUGGESTION_INSERT,
  SUGGESTION_DELETE,
  acceptAllSuggestions,
  acceptSuggestion,
  getSuggestions,
  rejectAllSuggestions,
  rejectSuggestion,
  setDocumentMode,
  setSuggestionAuthor,
} from '../suggestChanges.js'

/**
 * P1 of #27 / #28 — suggesting mode + track changes. Suggestions are marks, so
 * these tests assert on `getJSON()`/`getSuggestions()` rather than the DOM.
 */
describe('suggesting mode (P1)', () => {
  let editorInstance: ReturnType<typeof createEditor>

  const editor = () => editorInstance.editor

  const typeText = (text: string) => {
    const { state, view } = editor()
    const from = state.selection.from
    view.someProp('handleTextInput', (f) =>
      (f as unknown as (v: unknown, from: number, to: number, text: string) => boolean)(
        view,
        from,
        from,
        text,
      ),
    )
  }

  const pressKey = (key: string) => {
    const { view } = editor()
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    view.someProp('handleKeyDown', (f) =>
      (f as unknown as (v: unknown, event: KeyboardEvent) => boolean)(view, event),
    )
  }

  const marksOn = (text: string) => {
    const found: string[] = []
    editor().state.doc.descendants((node) => {
      if (node.isText && node.text?.includes(text)) {
        for (const mark of node.marks) found.push(mark.type.name)
      }
    })
    return found
  }

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editorInstance = createEditor({ target, plugins: defaultPlugins })
    setSuggestionAuthor(editor(), { id: 'u1', name: 'Alice' })
  })

  afterEach(() => {
    editorInstance.destroy()
    editorInstance.editor.view.dom.parentElement?.remove()
  })

  it('editing mode types normally (no suggestion marks)', () => {
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    typeText('!') // the handler declines; nothing is captured
    expect(getSuggestions(editor())).toHaveLength(0)
    editor().commands.insertContent('!')
    expect(editor().getText()).toBe('Hello!')
    expect(getSuggestions(editor())).toHaveLength(0)
  })

  it('suggesting mode records an insertion as a suggestion', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    typeText('!')

    const suggestions = getSuggestions(editor())
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ type: 'insert', authorName: 'Alice' })
    expect(editor().getText()).toBe('Hello!')
    expect(marksOn('!')).toContain(SUGGESTION_INSERT)
  })

  it('groups a typed run into a single suggestion', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    typeText('a')
    typeText('b')
    typeText('c')
    expect(getSuggestions(editor())).toHaveLength(1)
    expect(editor().getText()).toBe('Helloabc')
  })

  it('suggesting mode marks a backspace deletion instead of removing text', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    pressKey('Backspace')

    expect(editor().getText()).toBe('Hello') // text kept
    const suggestions = getSuggestions(editor())
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].type).toBe('delete')
    expect(marksOn('o')).toContain(SUGGESTION_DELETE)
  })

  it('accepting an insertion keeps the text and drops the mark', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    typeText('!')
    const id = getSuggestions(editor())[0].id

    expect(acceptSuggestion(editor(), id)).toBe(true)
    expect(getSuggestions(editor())).toHaveLength(0)
    expect(editor().getText()).toBe('Hello!')
    expect(marksOn('!')).not.toContain(SUGGESTION_INSERT)
  })

  it('rejecting an insertion removes the text', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    typeText('!')
    const id = getSuggestions(editor())[0].id

    expect(rejectSuggestion(editor(), id)).toBe(true)
    expect(editor().getText()).toBe('Hello')
    expect(getSuggestions(editor())).toHaveLength(0)
  })

  it('accepting a deletion removes the text; rejecting keeps it', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    pressKey('Backspace')
    const id = getSuggestions(editor())[0].id

    expect(rejectSuggestion(editor(), id)).toBe(true)
    expect(editor().getText()).toBe('Hello')
    expect(getSuggestions(editor())).toHaveLength(0)

    editor().commands.focus('end')
    pressKey('Backspace')
    const id2 = getSuggestions(editor())[0].id
    expect(acceptSuggestion(editor(), id2)).toBe(true)
    expect(editor().getText()).toBe('Hell')
  })

  it('accept all / reject all resolve every suggestion', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hi</p>')
    editor().commands.focus('end')
    typeText('X')
    typeText('Y')
    pressKey('Backspace')
    expect(getSuggestions(editor()).length).toBeGreaterThan(0)

    expect(acceptAllSuggestions(editor())).toBe(true)
    expect(getSuggestions(editor())).toHaveLength(0)

    typeText('Z')
    expect(rejectAllSuggestions(editor())).toBe(true)
    expect(getSuggestions(editor())).toHaveLength(0)
  })

  it('does not tag programmatic edits while suggesting', () => {
    setDocumentMode(editor(), 'suggesting')
    editor().commands.setContent('<p>Hello</p>')
    editor().commands.focus('end')
    editor().commands.insertContent('prog')
    expect(getSuggestions(editor())).toHaveLength(0)
    expect(editor().getText()).toBe('Helloprog')
  })
})
