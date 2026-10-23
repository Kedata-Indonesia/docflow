import { plainTextFromHtml } from './utils.js'

/**
 * Escape RTF control characters and non-ASCII code units.
 *
 * The header declares `\ansicpg1252`, so anything outside ASCII has to be
 * written as a `\uN?` control word. Emitting raw UTF-8 bytes makes readers
 * decode them as Latin-1 (`café` -> `cafÃ©`). Surrogate halves are emitted as
 * negative signed 16-bit values, which is how RTF carries code points above
 * U+FFFF; readers combine the pair back into one character.
 */
function escapeRtf(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\par\n')

  // Walk code units, not code points: RTF carries astral characters as a pair
  // of signed `\uN?` words, one per surrogate half.
  let out = ''
  for (let index = 0; index < escaped.length; index += 1) {
    const code = escaped.charCodeAt(index)
    out += code > 0x7f ? `\\u${code > 0x7fff ? code - 0x10000 : code}?` : escaped[index]
  }
  return out
}

export function generateRtf(title: string, html: string): string {
  const text = plainTextFromHtml(html)
  const rtfBody = escapeRtf(text)
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}
{\\*\\generator Riched20 10.0.19041}\\viewkind4\\uc1 
\\pard\\f0\\fs22 ${escapeRtf(title)}\\par\\par
${rtfBody}
\\par
}
`
}
