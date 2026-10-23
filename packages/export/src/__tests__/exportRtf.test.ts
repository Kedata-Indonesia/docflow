import { describe, it, expect } from 'vitest'
import { generateRtf } from '../rtf.js'

describe('RTF export', () => {
  it('escapes non-ASCII characters, curly quotes, dashes, accents, emojis, and title with braces', () => {
    const title = 'Document { Title } \\ test'
    const html = '<p>— “kutipan” café 🚀</p>'
    const rtf = generateRtf(title, html)

    // Check title is escaped properly and braces don't break structure
    expect(rtf).toContain('Document \\{ Title \\} \\\\ test')
    // Check en/em dash or non-ASCII code units are escaped as \u<code?>?
    // '—' is code 8212 (0x2014)
    expect(rtf).toContain('\\u8212?')
    // '“' is code 8220 (0x201C), '”' is code 8221 (0x201D)
    expect(rtf).toContain('\\u8220?')
    expect(rtf).toContain('\\u8221?')
    // 'é' in café is code 233 (0xe9)
    expect(rtf).toContain('\\u233?')
    // Emoji '🚀' (surrogate pair 0x1f680)
    expect(rtf).toContain('\\u128640?')
  })
})
