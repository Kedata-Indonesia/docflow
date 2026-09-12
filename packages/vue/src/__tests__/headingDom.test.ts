/**
 * `headingElementAt` — the outline resolves its scroll target by ProseMirror
 * position. Using `textContent` matching instead breaks as soon as a heading
 * contains an inline atom (citation-backed footnote, citation, page number),
 * because the node view renders extra text into the heading, and it silently
 * jumps to the first of several identically-titled headings.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import { headingElementAt } from '../utils/headingDom.js'

let cleanups: Array<() => void> = []

afterEach(() => {
  for (const fn of cleanups) fn()
  cleanups = []
})

function makeEditor(content: object) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = createEditor({ target, plugins: defaultPlugins, content })
  cleanups.push(() => {
    instance.destroy()
    target.remove()
  })
  return instance
}

function positionsByType(
  editor: ReturnType<typeof createEditor>['editor'],
  type: string,
): number[] {
  const found: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) found.push(pos)
    return true
  })
  return found
}

describe('headingElementAt', () => {
  it('returns the heading element at the node position', () => {
    const instance = makeEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'BAB I' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'isi' }] },
      ],
    })
    const [heading] = positionsByType(instance.editor, 'heading')
    const el = headingElementAt(instance.editor, heading!)
    expect(el).toBeTruthy()
    expect(el!.tagName).toBe('H2')
    expect(el!.textContent).toBe('BAB I')
  })

  it('resolves a heading whose DOM text carries an inline atom marker', () => {
    const instance = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [
            { type: 'text', text: '1. Latar Belakang' },
            { type: 'footnote', attrs: { content: 'Sumber acuan.' } },
          ],
        },
      ],
    })
    const [heading] = positionsByType(instance.editor, 'heading')
    const node = instance.editor.state.doc.nodeAt(heading!)
    const el = headingElementAt(instance.editor, heading!)
    expect(el).toBeTruthy()
    expect(el!.tagName).toBe('H3')
    // Node text (what the outline lists) vs rendered DOM text differ…
    expect(node!.textContent).toBe('1. Latar Belakang')
    expect(el!.textContent?.trim()).not.toBe(node!.textContent)
    // …yet the position still resolves to the right element.
    expect(el!.textContent).toContain('1. Latar Belakang')
  })

  it('returns null for a non-heading position', () => {
    const instance = makeEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'BAB I' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'isi' }] },
      ],
    })
    const [paragraph] = positionsByType(instance.editor, 'paragraph')
    expect(headingElementAt(instance.editor, paragraph!)).toBeNull()
  })

  it('returns null for a position that no longer exists', () => {
    const instance = makeEditor({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'BAB I' }] }],
    })
    expect(headingElementAt(instance.editor, 9999)).toBeNull()
  })

  it('distinguishes two headings with identical text by position', () => {
    const instance = makeEditor({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Latar Belakang' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'pertama' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Latar Belakang' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'kedua' }] },
      ],
    })
    const headings = positionsByType(instance.editor, 'heading')
    expect(headings.length).toBe(2)
    const first = headingElementAt(instance.editor, headings[0]!)!
    const second = headingElementAt(instance.editor, headings[1]!)!
    expect(first).not.toBe(second)
  })
})
