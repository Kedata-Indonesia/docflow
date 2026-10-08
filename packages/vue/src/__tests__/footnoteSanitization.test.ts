import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { describe, it, expect, vi } from 'vitest'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { useFootnotes } from '../composables/useFootnotes.js'

const IMG_XSS = '<img src=x onerror="alert(document.cookie)">'
const SCRIPT_XSS = '<script>alert(1)</script>'
const SVG_XSS = '<svg onload="alert(1)"></svg>'

/**
 * Regression coverage for issue #71: the persisted `data-footnote-content`
 * fallback is a document-derived string and must never reach `innerHTML`
 * unsanitized (stored XSS in collab sessions / imported documents).
 */
describe('footnote content sanitization (issue #71)', () => {
  const setup = (footnoteAttrs: Record<string, Record<string, string>>) => {
    const dom = document.createElement('div')
    const pagination = document.createElement('div')
    pagination.setAttribute('data-rm-pagination', '')
    const pageBreak = document.createElement('div')
    pageBreak.className = 'rm-page-break'
    const breaker = document.createElement('div')
    breaker.className = 'breaker'
    pageBreak.appendChild(breaker)
    pagination.appendChild(pageBreak)
    dom.appendChild(pagination)

    for (const attrs of Object.values(footnoteAttrs)) {
      const el = document.createElement('span')
      el.className = 'docs-footnote-ref'
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
      dom.appendChild(el)
    }

    const editor = {
      view: { dom, dispatch: vi.fn() },
      state: { tr: {} },
    } as unknown as DocsEditor['editor']

    let api!: ReturnType<typeof useFootnotes>
    const TestComponent = defineComponent({
      setup() {
        api = useFootnotes({
          editor: shallowRef(editor),
          editorRef: ref<HTMLElement | null>(dom),
          isReady: ref(true),
        })
        return () => h('div')
      },
    })
    const wrapper = mount(TestComponent)
    return { wrapper, api, dom }
  }

  it('sanitizes persisted citation-backed footnote content before innerHTML', () => {
    const payload = `${IMG_XSS}note <b>bold</b>${SCRIPT_XSS}${SVG_XSS}`
    const { wrapper, api, dom } = setup({
      a: {
        'data-footnote-source-id': 'src-1',
        'data-citation-id': 'cit-1',
        'data-footnote-content': payload,
      },
    })
    try {
      api.updateFootnotes()

      const textDiv = dom.querySelector<HTMLElement>('.docs-footnote-item-text')
      expect(textDiv).not.toBeNull()
      const rendered = textDiv!.innerHTML

      // No live markup escapes the allowlist.
      expect(rendered).not.toContain('onerror')
      expect(rendered).not.toContain('onload')
      expect(rendered).not.toContain('<img')
      expect(rendered).not.toContain('<script')
      expect(rendered).not.toContain('<svg')
      // Legitimate inline formatting is preserved.
      expect(rendered).toBe('note <b>bold</b>')
      expect(textDiv!.textContent).toContain('note bold')
      // Sanitized-away payloads must not mark the slot as empty.
      expect(textDiv!.hasAttribute('data-empty')).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves citation inline formatting (sup/sub/nobr) from persisted content', () => {
    // Issue #73 item 7: `<sup>`/`<sub>`/`<nobr>` are part of the shared inline
    // allowlist now, so the transient persisted fallback keeps citeproc shape
    // without letting any attribute/handler through.
    const payload = '<sup>1</sup> note <sub>x</sub> <nobr>nb</nobr><img src=x onerror="alert(1)">'
    const { wrapper, api, dom } = setup({
      a: {
        'data-footnote-source-id': 'src-1',
        'data-citation-id': 'cit-1',
        'data-footnote-content': payload,
      },
    })
    try {
      api.updateFootnotes()

      const textDiv = dom.querySelector<HTMLElement>('.docs-footnote-item-text')
      expect(textDiv).not.toBeNull()
      expect(textDiv!.innerHTML).toBe('<sup>1</sup> note <sub>x</sub> <nobr>nb</nobr>')
      expect(textDiv!.innerHTML).not.toContain('onerror')
      expect(textDiv!.querySelector('img')).toBeNull()
    } finally {
      wrapper.unmount()
    }
  })

  it('numbers paged footnotes continuously and anchors them in the breaker (refactor parity)', () => {
    const { wrapper, api, dom } = setup({
      a: { 'data-footnote-content': 'first' },
      b: { 'data-footnote-content': 'second' },
    })
    try {
      api.updateFootnotes()

      const breaker = dom.querySelector('.breaker')
      expect(breaker).not.toBeNull()
      const container = breaker!.querySelector<HTMLElement>('.docs-page-footnotes')
      expect(container).not.toBeNull()
      // Prepend so the footnote area sits above the footer inside the breaker.
      expect(breaker!.firstElementChild).toBe(container)

      const rows = container!.querySelectorAll<HTMLElement>('.docs-footnote-item')
      expect(Array.from(rows).map((r) => r.id)).toEqual(['fn-0-0', 'fn-0-1'])
      expect(
        Array.from(rows).map((r) => r.querySelector('.docs-footnote-item-num')?.textContent),
      ).toEqual(['1', '2'])

      const refs = dom.querySelectorAll<HTMLElement>('.docs-footnote-ref')
      expect(Array.from(refs).map((r) => r.textContent)).toEqual(['1', '2'])
      expect(refs[0].dataset.footnoteItemId).toBe('fn-0-0')
    } finally {
      wrapper.unmount()
    }
  })

  it('renders free-text footnote content as inert plain text', () => {
    const { wrapper, api, dom } = setup({
      a: {
        'data-footnote-content': `${IMG_XSS}<b>typed</b>`,
      },
    })
    try {
      api.updateFootnotes()

      const textDiv = dom.querySelector<HTMLElement>('.docs-footnote-item-text')
      expect(textDiv).not.toBeNull()
      // Plain-text branch is rendered via textContent: markup stays literal.
      expect(textDiv!.querySelector('img')).toBeNull()
      expect(textDiv!.querySelector('b')).toBeNull()
      expect(textDiv!.textContent).toContain('<b>typed</b>')
      // Rendered as escaped text — no live element, no live handler.
      expect(textDiv!.innerHTML).not.toContain('<img')
      expect(textDiv!.innerHTML).not.toContain('<script')
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps the empty-state marker when there is no persisted content', () => {
    const { wrapper, api, dom } = setup({
      a: { 'data-footnote-source-id': 'src-1', 'data-citation-id': 'cit-1' },
    })
    try {
      api.updateFootnotes()

      const textDiv = dom.querySelector<HTMLElement>('.docs-footnote-item-text')
      expect(textDiv).not.toBeNull()
      expect(textDiv!.innerHTML).toBe('')
      expect(textDiv!.getAttribute('data-empty')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })
})
