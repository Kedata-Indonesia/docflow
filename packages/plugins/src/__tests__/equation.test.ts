import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { equationPlugin, renderEquation } from '../equation.js'

type Instance = ReturnType<typeof createEditor>

interface JsonNode {
  type?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
}

function makeEditor(content?: unknown): { instance: Instance; target: HTMLDivElement } {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = createEditor({
    target,
    plugins: [equationPlugin],
    ...(content ? { content } : {}),
  })
  return { instance, target }
}

function nodesOfType(instance: Instance, type: string): JsonNode[] {
  const found: JsonNode[] = []
  const walk = (nodes: JsonNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === type) found.push(node)
      walk(node.content)
    }
  }
  walk((instance.editor.getJSON() as JsonNode).content)
  return found
}

function insertDisplay(instance: Instance, attrs?: { latex?: string; numbered?: boolean }): boolean {
  return equationPlugin.commands!.insertDisplayEquation!(instance.editor, attrs) as boolean
}

function insertInline(instance: Instance, attrs?: { latex?: string }): boolean {
  return equationPlugin.commands!.insertInlineEquation!(instance.editor, attrs) as boolean
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('equationPlugin (C1)', () => {
  let cleanup: (() => void) | null = null

  function mount(content?: unknown) {
    const mounted = makeEditor(content)
    cleanup = () => {
      mounted.instance.destroy()
      mounted.target.remove()
    }
    return mounted
  }

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  it('exposes localized toolbar and slash entries', () => {
    expect(equationPlugin.toolbar).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'insertInlineEquation',
          labelKey: 'header.inlineEquation',
          iconComponent: 'Sigma',
        }),
        expect.objectContaining({
          action: 'insertDisplayEquation',
          labelKey: 'header.equation',
          iconComponent: 'Sigma',
        }),
      ]),
    )
    expect(equationPlugin.slashCommands?.map((command) => command.nameKey)).toEqual([
      'header.inlineEquation',
      'header.equation',
    ])
  })

  it('inserts a display equation with numbering attrs and a trailing paragraph', () => {
    const { instance } = mount()
    expect(insertDisplay(instance, { latex: 'E = mc^2', numbered: true })).toBe(true)

    const nodes = nodesOfType(instance, 'displayEquation')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].attrs).toMatchObject({ latex: 'E = mc^2', numbered: true, label: null })

    const top = (instance.editor.getJSON() as JsonNode).content ?? []
    expect(top.map((node) => node.type)).toEqual(['displayEquation', 'paragraph'])
  })

  it('inserts an inline equation and keeps the source on round-trip', () => {
    const { instance } = mount()
    instance.editor.commands.insertContent('Area: ')
    expect(insertInline(instance, { latex: '\\pi r^2' })).toBe(true)

    expect(nodesOfType(instance, 'inlineEquation')[0].attrs).toMatchObject({ latex: '\\pi r^2' })
    // The rendered view is derived — it must never leak into the document.
    expect(JSON.stringify(instance.editor.getJSON())).not.toContain('katex')

    const html = instance.editor.getHTML()
    expect(html).toContain('data-node-type="inlineEquation"')
    expect(html).toContain('data-latex="\\pi r^2"')

    const reparsed = mount(html)
    expect(nodesOfType(reparsed.instance, 'inlineEquation')[0].attrs).toMatchObject({
      latex: '\\pi r^2',
    })
  })

  it('renders KaTeX in the NodeView', () => {
    const { instance, target } = mount()
    insertInline(instance, { latex: '\\frac{1}{2}' })

    expect(target.querySelector('.katex')).not.toBeNull()
    expect(target.querySelector('.docs-equation--inline')).not.toBeNull()
  })

  it('never lets user LaTeX inject HTML, links or images', () => {
    // trust:false renders dangerous commands as inert text — the source only
    // appears inside the MathML annotation, never in an executable attribute.
    const container = document.createElement('div')

    container.innerHTML = renderEquation('\\href{javascript:alert(1)}{click}')
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[href]')).toBeNull()

    container.innerHTML = renderEquation('\\includegraphics{file:///etc/passwd}')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[src]')).toBeNull()
  })

  it('renders invalid LaTeX without throwing', () => {
    expect(() => renderEquation('\\frac{1')).not.toThrow()
    expect(renderEquation('\\frac{1')).toContain('katex')
    expect(renderEquation('')).toContain('docs-equation__placeholder')
  })

  it('toggles an inline equation to its source and commits with Enter', () => {
    const { instance, target } = mount()
    insertInline(instance, { latex: 'x^2' })

    const wrapper = target.querySelector('.docs-equation--inline') as HTMLElement
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const input = target.querySelector('.docs-equation__input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'y^2'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(nodesOfType(instance, 'inlineEquation')[0].attrs).toMatchObject({ latex: 'y^2' })
    expect(target.querySelector('.docs-equation__input')).toBeNull()
  })

  it('opens the source editor for a new empty display equation and commits it', async () => {
    const { instance, target } = mount()
    insertDisplay(instance)
    await tick()

    const input = target.querySelector('.docs-equation-block__input') as HTMLTextAreaElement
    expect(input).not.toBeNull()
    input.value = '\\sum_i x_i'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(nodesOfType(instance, 'displayEquation')[0].attrs).toMatchObject({ latex: '\\sum_i x_i' })
  })

  it('removes an empty equation when the editor is cancelled with Escape', async () => {
    const { instance, target } = mount()
    insertDisplay(instance)
    await tick()

    const input = target.querySelector('.docs-equation-block__input') as HTMLTextAreaElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(nodesOfType(instance, 'displayEquation')).toHaveLength(0)
  })

  it('drives the shared transient edit state through editor.storage', async () => {
    const { instance, target } = mount()
    insertDisplay(instance, { latex: 'a+b' })

    const wrapper = target.querySelector('.docs-equation-block') as HTMLElement
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const storage = (instance.editor.storage as unknown as Record<string, unknown>).equation as {
      editingPos: number | null
    }
    expect(storage.editingPos).toBeTypeOf('number')

    const input = target.querySelector('.docs-equation-block__input') as HTMLTextAreaElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(storage.editingPos).toBeNull()
  })
})
