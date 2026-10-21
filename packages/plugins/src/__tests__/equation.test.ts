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
        expect.objectContaining({
          action: 'insertNumberedEquation',
          labelKey: 'header.numberedEquation',
          iconComponent: 'Sigma',
        }),
      ]),
    )
    expect(equationPlugin.slashCommands?.map((command) => command.nameKey)).toEqual([
      'header.inlineEquation',
      'header.equation',
      'header.numberedEquation',
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

  it('cancels without committing when removing the focused textarea fires blur (#343)', async () => {
    const { instance, target } = mount()
    insertDisplay(instance, { latex: 'a+b' })
    await tick()

    const wrapper = target.querySelector('.docs-equation-block') as HTMLElement
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const input = target.querySelector('.docs-equation-block__input') as HTMLTextAreaElement
    expect(input).not.toBeNull()
    input.value = 'changed'

    // Chromium can fire `blur` synchronously while the focused textarea is
    // removed. Model that: without detaching the listener first, cleanup
    // re-enters commit/cleanup and the second remove throws NotFoundError.
    const remove = input.remove.bind(input)
    let blurFired = false
    input.remove = () => {
      if (!blurFired) {
        blurFired = true
        input.dispatchEvent(new Event('blur'))
      }
      remove()
    }

    expect(() =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ).not.toThrow()
    expect(target.querySelector('.docs-equation-block__input')).toBeNull()
    // Escape is a cancel: the edited source must not be committed.
    expect(nodesOfType(instance, 'displayEquation')[0].attrs).toMatchObject({ latex: 'a+b' })
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

  it('numbers only numbered display equations and renumbers live (#256)', async () => {
    const { instance, target } = mount()
    insertDisplay(instance, { latex: 'a', numbered: true })
    insertDisplay(instance, { latex: 'b' })
    insertDisplay(instance, { latex: 'c', numbered: true })
    await tick()

    const numbers = () =>
      Array.from(target.querySelectorAll('[data-equation-number]')).map((el) => el.textContent)
    expect(numbers()).toEqual(['(1)', '', '(2)'])

    // Numbering is derived, never stored in the document.
    expect(JSON.stringify(instance.editor.getJSON())).not.toContain('(1)')

    // Toggle the middle equation on -> (1), (2), (3).
    const positions: number[] = []
    instance.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'displayEquation') positions.push(pos)
    })
    instance.editor.commands.setNodeSelection(positions[1])
    instance.editor.commands.updateAttributes('displayEquation', { numbered: true })
    await tick()
    expect(numbers()).toEqual(['(1)', '(2)', '(3)'])

    // Delete the first equation -> renumber (1), (2).
    instance.editor.commands.setNodeSelection(positions[0])
    instance.editor.commands.deleteSelection()
    await tick()
    expect(numbers()).toEqual(['(1)', '(2)'])
  })

  it('inserts a numbered display equation via the dedicated command (#256)', async () => {
    const { instance, target } = mount()
    expect(equationPlugin.commands!.insertNumberedEquation!(instance.editor)).toBe(true)
    await tick()

    expect(nodesOfType(instance, 'displayEquation')[0].attrs).toMatchObject({ numbered: true })
    expect(target.querySelector('[data-equation-number]')?.textContent).toBe('(1)')
  })

  it('toggles numbering from the display source editor (#256)', async () => {
    const { instance, target } = mount()
    insertDisplay(instance, { latex: 'x^2' })

    const wrapper = target.querySelector('.docs-equation-block') as HTMLElement
    wrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const checkbox = target.querySelector('.docs-equation-block__number-toggle input') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()

    expect(nodesOfType(instance, 'displayEquation')[0].attrs).toMatchObject({ numbered: true })
    expect(target.querySelector('[data-equation-number]')?.textContent).toBe('(1)')
  })
})
