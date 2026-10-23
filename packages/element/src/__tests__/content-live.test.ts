import { afterEach, describe, expect, it } from 'vitest'
import { DocsEditorElement } from '../index.js'

/** Fresh tag per suite: a custom element constructor registers only once. */
class ContentElement extends DocsEditorElement {}
customElements.define('docs-editor-content-live', ContentElement)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const until = async (predicate: () => boolean, label: string, timeout = 3000): Promise<void> => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await wait(25)
  }
  throw new Error(`timeout waiting for ${label}`)
}

const doc = (text: string) => JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

/**
 * The wrapper mounts `DocsEditor` as a nested custom element, so the editor
 * paints inside that element's own shadow root.
 */
const innerElement = (el: ContentElement): HTMLElement | null =>
  (el.shadowRoot?.querySelector('*:not(style)') as HTMLElement | null) ?? null

const editorText = (el: ContentElement): string =>
  innerElement(el)?.shadowRoot?.textContent ?? ''

describe('content rewrites while connected (issue #370)', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('replaces the rendered document without a remount', async () => {
    const el = document.createElement('docs-editor-content-live') as ContentElement
    el.setAttribute('content', doc('First'))
    document.body.appendChild(el)

    await until(() => editorText(el).includes('First'), 'the first document to render')
    const innerBefore = innerElement(el)
    expect(innerBefore).not.toBeNull()

    el.setAttribute('content', doc('Second'))
    await until(() => editorText(el).includes('Second'), 'the rewrite to render')

    expect(editorText(el)).not.toContain('First')
    // Same editor instance: the prop was applied, not rebuilt from scratch.
    expect(innerElement(el)).toBe(innerBefore)
  })
})
