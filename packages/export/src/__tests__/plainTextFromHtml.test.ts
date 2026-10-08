// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { plainTextFromHtml } from '../utils.js'

interface PwnableWindow {
  __pwned?: number
}

describe('plainTextFromHtml', () => {
  it('separates adjacent paragraphs with a blank line', () => {
    expect(plainTextFromHtml('<p>a</p><p>b</p>')).toBe('a\n\nb')
  })

  it('flows a heading into the following paragraph', () => {
    expect(plainTextFromHtml('<h1>Title</h1><p>Body <b>bold</b></p>')).toBe('Title\nBody bold')
  })

  it('keeps <br> breaks and list items on their own lines', () => {
    expect(plainTextFromHtml('<p>line1<br>line2</p>')).toBe('line1\nline2')
    // List items get a single newline (not a blank line), matching innerText.
    expect(plainTextFromHtml('<ul><li>one</li><li>two</li></ul>')).toBe('one\ntwo')
  })

  it('preserves <pre> content verbatim and separates table cells with tabs', () => {
    expect(plainTextFromHtml('<pre>  if (x) {\n    y()\n  }</pre>')).toBe(
      '  if (x) {\n    y()\n  }',
    )
    // Trailing spaces and blank-line runs inside a code block must survive.
    expect(plainTextFromHtml('<pre>a  \nb\n\n\nc</pre>')).toBe('a  \nb\n\n\nc')
    // A code block flows after a paragraph with a single newline (innerText).
    expect(plainTextFromHtml('<p>a</p><pre>  code</pre>')).toBe('a\n  code')
    expect(plainTextFromHtml('<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a\tb')
  })

  it('decodes HTML entities', () => {
    expect(plainTextFromHtml('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3')
  })

  it('drops script, style, template and noscript content', () => {
    const html =
      '<p>a</p><script>alert(1)</script><style>x{}</style>' +
      '<template><p>tpl</p></template><noscript>noscript</noscript><p>b</p>'
    expect(plainTextFromHtml(html)).toBe('a\n\nb')
  })

  it('parses XSS payloads in an inert tree without mutating the document', () => {
    const win = window as unknown as PwnableWindow
    const childCountBefore = document.body.childElementCount
    const payload = '<img src=x onerror="window.__pwned=1">safe'

    let result = ''
    expect(() => {
      result = plainTextFromHtml(payload)
    }).not.toThrow()

    expect(result).toBe('safe')
    expect(win.__pwned).toBeUndefined()
    expect(document.body.childElementCount).toBe(childCountBefore)
  })

  it('collapses source-formatting whitespace between blocks', () => {
    expect(plainTextFromHtml('<p>a</p>\n    <p>b</p>\n    <p>c</p>')).toBe('a\n\nb\n\nc')
    expect(plainTextFromHtml('<h1>Title</h1>\n<p>Body</p>')).toBe('Title\nBody')
  })

  it('normalizes CR/CRLF line endings without stray carriage returns', () => {
    expect(plainTextFromHtml('<p>a\r\nb\rc</p>')).toBe('a\nb\nc')
    expect(plainTextFromHtml('<p>a\r\nb\rc</p>')).not.toContain('\r')
  })

  it('returns an empty string for empty or nullish input', () => {
    expect(plainTextFromHtml('')).toBe('')
    expect(plainTextFromHtml(undefined as unknown as string)).toBe('')
    expect(plainTextFromHtml(null as unknown as string)).toBe('')
  })
})
