import { plainTextFromHtml } from './utils.js'

function escapeRtfText(str: string): string {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // Check for surrogate pairs if emoji or supplementary chars are present
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const nextCode = str.charCodeAt(i + 1)
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        const codepoint = (code - 0xd800) * 0x400 + (nextCode - 0xdc00) + 0x10000
        result += `\\u${codepoint}?`
        i++
        continue
      }
    }

    if (code === 0x5c) { // \
      result += '\\\\'
    } else if (code === 0x7b) { // {
      result += '\\{'
    } else if (code === 0x7d) { // }
      result += '\\}'
    } else if (code === 0x0a || code === 0x0d) {
      if (code === 0x0d && i + 1 < str.length && str.charCodeAt(i + 1) === 0x0a) {
        i++
      }
      result += '\\par\n'
    } else if (code > 0x7f) {
      result += `\\u${code}?`
    } else {
      result += str[i]
    }
  }
  return result
}

export function generateRtf(title: string, html: string): string {
  const text = plainTextFromHtml(html)
  const escapedTitle = escapeRtfText(title).replace(/\\par\n/g, ' ')
  const rtfBody = escapeRtfText(text)
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}
{\\*\\generator Riched20 10.0.19041}\\viewkind4\\uc1 
\\pard\\f0\\fs22 ${escapedTitle}\\par\\par
${rtfBody}
\\par
}
`
}
