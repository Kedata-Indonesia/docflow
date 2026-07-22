import { plainTextFromHtml } from './utils.js'

export function generateRtf(title: string, html: string): string {
  const text = plainTextFromHtml(html)
  const rtfBody = text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\par\n')
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}
{\\*\\generator Riched20 10.0.19041}\\viewkind4\\uc1 
\\pard\\f0\\fs22 ${title}\\par\\par
${rtfBody}
\\par
}
`
}
