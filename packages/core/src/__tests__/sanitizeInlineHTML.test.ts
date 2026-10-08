import { describe, it, expect } from 'vitest'
import { sanitizeInlineHTML } from '../sanitizeInlineHTML.js'

// Regression tests for issue #51: document-derived header/footer templates are
// rendered as raw HTML, so stored XSS payloads must be neutralized first.
describe('sanitizeInlineHTML', () => {
  describe('neutralizes XSS payloads', () => {
    it('drops an <img onerror> tag entirely', () => {
      const out = sanitizeInlineHTML('<img src=x onerror="alert(document.cookie)">')
      expect(out).toBe('')
      expect(out).not.toContain('onerror')
    })

    it('removes <script> and its content', () => {
      const out = sanitizeInlineHTML('before<script>alert(1)</script>after')
      expect(out).toBe('beforeafter')
    })

    it('removes <svg onload> and its subtree', () => {
      const out = sanitizeInlineHTML('<svg onload="alert(1)"><text>x</text></svg>')
      expect(out).toBe('')
      expect(out).not.toContain('onload')
    })

    it('unwraps <a href="javascript:..."> keeping only the text', () => {
      const out = sanitizeInlineHTML('<a href="javascript:alert(1)">x</a>')
      expect(out).toBe('x')
      expect(out).not.toContain('javascript')
    })

    it('removes <iframe> and its subtree', () => {
      const out = sanitizeInlineHTML('<iframe src="https://evil.test">fallback</iframe>')
      expect(out).toBe('')
    })

    it('strips inline event handlers and styles from allowed tags', () => {
      const out = sanitizeInlineHTML('<b onclick="alert(1)" style="color:red">hi</b>')
      expect(out).toBe('<b>hi</b>')
    })
  })

  describe('preserves safe inline formatting', () => {
    it('keeps b/strong/i/em/u/br', () => {
      const clean = '<b>bold</b><strong>strong</strong><i>i</i><em>e</em><u>u</u><br>'
      expect(sanitizeInlineHTML(clean)).toBe(clean)
    })

    it('unwraps unknown tags but keeps their text', () => {
      expect(sanitizeInlineHTML('<span>keep</span><div>text</div>')).toBe('keeptext')
    })

    it('preserves {page} and {total} tokens', () => {
      expect(sanitizeInlineHTML('Page {page} of {total}')).toBe('Page {page} of {total}')
      expect(sanitizeInlineHTML('<b>{page}</b>/<b>{total}</b>')).toBe('<b>{page}</b>/<b>{total}</b>')
    })
  })

  describe('robustness', () => {
    it('is idempotent', () => {
      const dirty = '<b onclick="x">a</b><script>alert(1)</script><span>b</span>'
      const once = sanitizeInlineHTML(dirty)
      expect(sanitizeInlineHTML(once)).toBe(once)
    })

    it('returns "" for empty and nullish input', () => {
      expect(sanitizeInlineHTML('')).toBe('')
      expect(sanitizeInlineHTML(undefined as unknown as string)).toBe('')
      expect(sanitizeInlineHTML(null as unknown as string)).toBe('')
    })

    it('passes plain text through byte-identically (no entities)', () => {
      expect(sanitizeInlineHTML('plain text {page}/{total}')).toBe('plain text {page}/{total}')
    })

    it('removes HTML comments', () => {
      expect(sanitizeInlineHTML('a<!-- secret -->b')).toBe('ab')
    })
  })
})
