import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import { collectSelectionContext } from '../utils/selectionContext.js'

/**
 * Location-context helper (issue #219).
 * Runs headless (happy-dom): no pagination DOM → page/pageCount fall back to
 * 1/1 and the line measurement has no real layout → falls back to 1.
 */
describe('collectSelectionContext', () => {
  let inst: ReturnType<typeof createEditor> | null = null

  afterEach(() => {
    inst?.destroy()
    document.body.innerHTML = ''
    inst = null
  })

  function setup() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    inst = createEditor({ target, plugins: defaultPlugins })
    return inst
  }

  /**
   * Place the cursor inside the text node that contains `text`.
   * NOTE: textContent offsets ≠ doc positions (structural offsets), so we must
   * locate the position via `doc.descendants`, not `textContent.indexOf`.
   */
  function placeCursorAt(text: string) {
    const { doc } = inst!.editor.state
    let target = -1
    doc.descendants((node, pos) => {
      if (target >= 0) return false
      if (node.isText && node.text?.includes(text)) {
        target = pos + node.text.indexOf(text) + 1
        return false
      }
      return undefined
    })
    expect(target).toBeGreaterThanOrEqual(0)
    inst!.editor.commands.setTextSelection(target)
  }

  it('counts the paragraph index in document order', () => {
    setup()
    inst!.editor.commands.insertContent([
      { type: 'paragraph', content: [{ type: 'text', text: 'Alinea satu.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Alinea dua.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Alinea tiga.' }] },
    ])
    placeCursorAt('Alinea tiga')
    const ctx = collectSelectionContext(inst!.editor)
    expect(ctx.paragraphIndex).toBe(3)
    expect(ctx.blockType).toBe('paragraph')
  })

  it('first block is paragraph 1', () => {
    setup()
    inst!.editor.commands.insertContent('Halo dunia')
    placeCursorAt('Halo dunia')
    const ctx = collectSelectionContext(inst!.editor)
    expect(ctx.paragraphIndex).toBe(1)
  })

  it('reports the nearest preceding heading as section', () => {
    setup()
    inst!.editor.commands.insertContent([
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'BAB I Pendahuluan' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Paragraf dalam bab satu.' }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Latar Belakang' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Paragraf dalam sub-bab.' }] },
    ])
    placeCursorAt('Paragraf dalam sub-bab')
    const ctx = collectSelectionContext(inst!.editor)
    expect(ctx.section).toBe('Latar Belakang')

    placeCursorAt('Paragraf dalam bab satu')
    expect(collectSelectionContext(inst!.editor).section).toBe('BAB I Pendahuluan')
  })

  it('falls back to page 1/1 when layout is unavailable (headless)', () => {
    setup()
    inst!.editor.commands.insertContent('Halo dunia')
    placeCursorAt('Halo dunia')
    const ctx = collectSelectionContext(inst!.editor)
    expect(ctx.page).toBe(1)
    expect(ctx.pageCount).toBe(1)
  })

  it('reports blockType for a heading block', () => {
    setup()
    inst!.editor.commands.insertContent([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Judul' }] },
    ])
    placeCursorAt('Judul')
    expect(collectSelectionContext(inst!.editor).blockType).toBe('heading')
  })

  it('always returns a numeric line (1 headless)', () => {
    setup()
    inst!.editor.commands.insertContent('Halo dunia')
    placeCursorAt('Halo dunia')
    const ctx = collectSelectionContext(inst!.editor)
    expect(typeof ctx.line).toBe('number')
    expect(ctx.line).toBeGreaterThanOrEqual(1)
  })

  it('is safe on an empty document', () => {
    setup()
    const ctx = collectSelectionContext(inst!.editor)
    expect(ctx.paragraphIndex).toBe(1)
    expect(ctx.page).toBe(1)
    expect(typeof ctx.line).toBe('number')
  })
})
