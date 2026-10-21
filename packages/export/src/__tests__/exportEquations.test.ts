// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { Schema } from 'prosemirror-model'
import { exportDocx } from '../docx/index.js'
import { jsonToMarkdown } from '../utils.js'
import { renderEquationsInHtml } from '../utils.js'

const inlineEquation = (latex: string) => ({ type: 'inlineEquation', attrs: { latex } })
const displayEquation = (latex: string, numbered = false) => ({
  type: 'displayEquation',
  attrs: { latex, numbered, label: null },
})

describe('equation DOCX export (C3)', () => {
  it('renders inline/display equations as native OMML and numbers numbered displays', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Area: ' },
            inlineEquation('\\pi r^2'),
          ],
        },
        displayEquation('\\frac{1}{2}', true),
        displayEquation('a^2 + b^2 = c^2'),
        displayEquation('\\int_0^1 x\\,dx', true),
      ],
    }

    const blob = await exportDocx({ doc, title: 'Equations' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const documentXml = await zip.file('word/document.xml')!.async('string')

    // Native Word equations (OMML), including the fraction from the display.
    expect(documentXml).toContain('m:oMath')
    expect(documentXml).toContain('m:f')
    // Derived numbers for the two numbered displays.
    expect(documentXml).toContain('(1)')
    expect(documentXml).toContain('(2)')
    expect(documentXml).not.toContain('(3)')
  })

  it('falls back to the LaTeX source when docx cannot convert a construct', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Unsupported: ' },
            inlineEquation('\\totallyUnknownMacro{1}'),
          ],
        },
      ],
    }

    const blob = await exportDocx({ doc, title: 'Fallback' })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const documentXml = await zip.file('word/document.xml')!.async('string')

    // The export must not fail; the source survives as text.
    expect(documentXml).toContain('totallyUnknownMacro')
  })
})

describe('equation Markdown export (C3)', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
      text: { group: 'inline' },
      inlineEquation: {
        group: 'inline',
        inline: true,
        atom: true,
        attrs: { latex: { default: '' } },
        toDOM: () => ['span', 0],
      },
      displayEquation: {
        group: 'block',
        atom: true,
        attrs: { latex: { default: '' }, numbered: { default: false } },
        toDOM: () => ['div', 0],
      },
    },
    marks: {},
  })

  it('emits $…$ for inline and $$…$$ for display', () => {
    const markdown = jsonToMarkdown(schema, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Area ' }, inlineEquation('\\pi r^2')],
        },
        displayEquation('\\frac{1}{2}', true),
      ],
    })

    expect(markdown).toContain('$\\pi r^2$')
    expect(markdown).toContain('$$\n\\frac{1}{2}\n$$')
  })
})

describe('equation HTML export (C3)', () => {
  it('upgrades equations to self-contained MathML and appends display numbers', () => {
    const html = [
      '<p>Area <span data-node-type="inlineEquation" data-latex="\\pi r^2">\\pi r^2</span></p>',
      '<div data-node-type="displayEquation" data-latex="\\frac{1}{2}" data-numbered="true">\\frac{1}{2}</div>',
      '<div data-node-type="displayEquation" data-latex="x^2" data-numbered="false">x^2</div>',
      '<div data-node-type="displayEquation" data-latex="\\int_0^1 x\\,dx" data-numbered="true">x</div>',
    ].join('')

    const out = renderEquationsInHtml(html)

    expect(out).toContain('<math')
    expect(out).toContain('(1)')
    expect(out).toContain('(2)')
    expect(out).not.toContain('(3)')
  })
})
