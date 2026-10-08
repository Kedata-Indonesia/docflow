import { describe, it, expect } from 'vitest'
import { sanitizeInlineHTML } from '../sanitizeInlineHTML.js'

/**
 * happy-dom only exposes browser automation through this window extension.
 * `disableChildFrameNavigation` stops a dropped `<iframe src=...>` from kicking
 * off a real frame fetch whose async task races the teardown of the test page.
 */
interface HappyDOMWindow extends Window {
  happyDOM?: {
    settings?: {
      navigation?: {
        disableChildFrameNavigation: boolean
      }
    }
  }
}

const childFrameNavigation = (): { disableChildFrameNavigation: boolean } | undefined =>
  (window as HappyDOMWindow).happyDOM?.settings?.navigation

const setChildFrameNavigation = (disabled: boolean): void => {
  const nav = childFrameNavigation()
  if (nav) nav.disableChildFrameNavigation = disabled
}

// Adversarial subset of well-known mutation-XSS (mXSS) payloads (issue #73).
// Each case abuses HTML parser re-tokenization across foreign content, raw-text
// elements, or templates so that a naive string filter misses the danger.
const MXSS_CORPUS: string[] = [
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></p></noscript>',
  '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<svg></p><style><g title="</style><img src onerror=alert(1)>">',
  '<math><annotation-xml encoding="text/html"><style><img src=x onerror=alert(1)></style></annotation-xml></math>',
  '<svg><foreignObject><style><img src=x onerror=alert(1)></style></foreignObject></svg>',
  '<template><img src=x onerror=alert(1)></template>',
  '<svg><script>alert(1)</script></svg>',
  '<noscript><style></noscript><img src=x onerror=alert(1)>',
  '<iframe srcdoc="<script>alert(1)</script>">x</iframe>',
]

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
      const previous = childFrameNavigation()?.disableChildFrameNavigation
      setChildFrameNavigation(true)
      try {
        const out = sanitizeInlineHTML('<iframe src="https://evil.test">fallback</iframe>')
        expect(out).toBe('')
      } finally {
        if (previous !== undefined) setChildFrameNavigation(previous)
      }
    })

    it('strips inline event handlers and styles from allowed tags', () => {
      const out = sanitizeInlineHTML('<b onclick="alert(1)" style="color:red">hi</b>')
      expect(out).toBe('<b>hi</b>')
    })
  })

  describe('mXSS corpus (issue #73)', () => {
    const FORBIDDEN_MARKUP = ['<img', '<script', '<svg', '<math', '<noscript', '<template', '<iframe', '<style']

    it.each(MXSS_CORPUS)('neutralizes %s', (payload) => {
      const out = sanitizeInlineHTML(payload)

      // (a) The result must be a stable fixed point.
      expect(sanitizeInlineHTML(out)).toBe(out)

      // (b) No dangerous raw markup may survive, even as literal text.
      for (const tag of FORBIDDEN_MARKUP) expect(out).not.toContain(tag)

      // (c) No inline event-handler attribute may survive.
      expect(out).not.toMatch(/\son[a-z]+\s*=/i)
    })
  })

  describe('preserves safe inline formatting', () => {
    it('keeps b/strong/i/em/u/br', () => {
      const clean = '<b>bold</b><strong>strong</strong><i>i</i><em>e</em><u>u</u><br>'
      expect(sanitizeInlineHTML(clean)).toBe(clean)
    })

    it('keeps citation-backed sup/sub/nobr', () => {
      const clean = '<sup>x</sup><sub>y</sub><nobr>z</nobr>'
      expect(sanitizeInlineHTML(clean)).toBe(clean)
    })

    it('strips attributes and handlers from sup/sub/nobr', () => {
      expect(sanitizeInlineHTML('<sup onclick="x" style="color:red">x</sup>')).toBe('<sup>x</sup>')
      expect(sanitizeInlineHTML('<sub class="c" data-x="1">y</sub>')).toBe('<sub>y</sub>')
      expect(sanitizeInlineHTML('<nobr onmouseover="x">z</nobr>')).toBe('<nobr>z</nobr>')
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
