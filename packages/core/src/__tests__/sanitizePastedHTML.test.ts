import { describe, it, expect } from 'vitest'
import { sanitizePastedHTML } from '../Editor.js'

// Regression tests for issue #52: pasting from Google Docs must not crash the
// ProseMirror parser, and text color / highlight must survive the paste.
describe('sanitizePastedHTML', () => {
  describe('strips non-content tags (crash prevention)', () => {
    it('removes <meta> tags', () => {
      expect(sanitizePastedHTML('<meta charset="utf-8"><p>hi</p>')).toBe('<p>hi</p>')
    })

    it('removes <style> tags and their content', () => {
      expect(sanitizePastedHTML('<style>p { color: red; }</style><p>hi</p>')).toBe('<p>hi</p>')
    })

    it('removes HTML comments', () => {
      expect(sanitizePastedHTML('<!-- gdocs comment --><p>hi</p>')).toBe('<p>hi</p>')
    })

    it('removes <link>, <base> and <title> tags', () => {
      const dirty =
        '<link rel="stylesheet" href="x.css"><base href="https://docs.google.com/"><title>Doc</title><p>hi</p>'
      expect(sanitizePastedHTML(dirty)).toBe('<p>hi</p>')
    })
  })

  describe('pass-through', () => {
    it('leaves clean, schema-valid HTML untouched', () => {
      const clean = '<p>Hello <strong>world</strong></p>'
      expect(sanitizePastedHTML(clean)).toBe(clean)
    })

    it('handles empty and plain-text input', () => {
      expect(sanitizePastedHTML('')).toBe('')
      expect(sanitizePastedHTML('plain text')).toBe('plain text')
    })
  })

  describe('Google Docs highlight conversion', () => {
    it('wraps a background-only span in <mark> keeping the background', () => {
      const out = sanitizePastedHTML('<span style="background-color: #ffff00;">hi</span>')
      expect(out).toMatch(/^<mark [^>]*background[^>]*>hi<\/mark>$/)
      expect(out).not.toContain('<span')
    })

    it('splits bg+color into <mark> with an inner color span', () => {
      const out = sanitizePastedHTML(
        '<span style="background-color: #ffff00; color: #ff0000;">hi</span>',
      )
      expect(out).toMatch(/^<mark [^>]*background[^>]*>/)
      // DOM pipeline emits `color: #ff0000` (no trailing ';'); the regex
      // parent test emitted `;`. The span carrying the text color is inner.
      expect(out).toMatch(/<span style="color: #ff0000;?">hi<\/span>/)
      // text color must not leak onto the mark (it would hide the highlight)
      expect(out).not.toMatch(/<mark [^>]*(?<!background-)color:/)
    })

    it('handles multiple sibling highlighted spans', () => {
      const out = sanitizePastedHTML(
        '<span style="background-color: #ff0000;">a</span><span style="background: #00ff00;">b</span>',
      )
      expect(out.match(/<mark /g)).toHaveLength(2)
      expect(out).toContain('>a</mark>')
      expect(out).toContain('>b</mark>')
    })

    it('does not touch spans without a background style', () => {
      // The DOM pipeline keeps the color span but normalizes the style
      // attribute (drops the trailing ';' the regex parent expected).
      const out = sanitizePastedHTML('<span style="color: #ff0000;">hi</span>')
      expect(out).toMatch(/^<span style="color: #ff0000;?">hi<\/span>$/)
    })
  })

  describe('Google Docs wrapper cleanup', () => {
    it('strips <b style="font-weight:normal"> wrappers (GDocs generic wrapper, not bold)', () => {
      const out = sanitizePastedHTML('<b style="font-weight:normal" id="docs-internal-x">hi</b>')
      expect(out).toBe('hi')
    })

    it('removes docs-internal-* id attributes', () => {
      expect(sanitizePastedHTML('<p id="docs-internal-guid-abc123">hi</p>')).toBe('<p>hi</p>')
    })
  })

  it('is idempotent (sanitizing twice changes nothing further)', () => {
    const gdocs =
      '<meta charset="utf-8"><b style="font-weight:normal"><span style="background-color: #ffff00; color: #ff0000;">hi</span></b>'
    const once = sanitizePastedHTML(gdocs)
    expect(sanitizePastedHTML(once)).toBe(once)
  })
})
