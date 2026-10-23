// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { generateRtf } from '../rtf.js'

function isAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) return false
  }
  return true
}

describe('generateRtf', () => {
  it('escapes RTF control characters in the body', () => {
    const rtf = generateRtf('Doc', '<p>a\\b {c}</p>')
    expect(rtf).toContain('a\\\\b \\{c\\}')
  })

  it('writes non-ASCII characters as \\u control words', () => {
    const rtf = generateRtf('Doc', '<p>— “kutipan” café</p>')
    expect(rtf).toContain('\\u8212?')
    expect(rtf).toContain('\\u8220?kutipan\\u8221?')
    expect(rtf).toContain('caf\\u233?')
  })

  it('encodes astral characters as a signed surrogate pair', () => {
    const rtf = generateRtf('Doc', '<p>😀</p>')
    expect(rtf).toContain('\\u-10179?\\u-8704?')
  })

  it('escapes braces and backslashes in the title', () => {
    const rtf = generateRtf('Laporan {akhir} \\ 2026', '<p>x</p>')
    expect(rtf).toContain('Laporan \\{akhir\\} \\\\ 2026')
  })

  it('turns line breaks into \\par', () => {
    // happy-dom collapses <p> boundaries in a detached element, so the break is
    // fed as a literal newline — the path RTF escaping actually cares about.
    const rtf = generateRtf('Doc', '<p>satu\ndua</p>')
    expect(rtf).toContain('satu\\par\ndua')
  })

  it('produces pure-ASCII output for a non-ASCII document', () => {
    const rtf = generateRtf('Judul — café', '<p>— “kutipan” café 😀 {x}</p>')
    expect(isAscii(rtf)).toBe(true)
  })
})
