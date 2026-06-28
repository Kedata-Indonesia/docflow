import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageLayout } from '../PageLayout'

function createMockContainer(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

function createMockEditorLike(container: HTMLElement): { dom: HTMLElement; view: { posAtDOM: (node: Node, offset: number) => number } } {
  const blocks = Array.from(container.children).filter((el): el is HTMLElement => el instanceof HTMLElement)
  return {
    dom: container,
    view: {
      posAtDOM: (node, offset) => {
        const index = blocks.indexOf(node as HTMLElement)
        if (index < 0) throw new Error('node not found')
        let pos = 1
        for (let i = 0; i < index; i++) {
          pos += blocks[i].textContent?.length ?? 0
          pos += 1
        }
        return pos + offset
      },
    },
  }
}

describe('PageLayout', () => {
  let container: HTMLElement

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    container?.remove()
  })

  it('debounces layout calls', async () => {
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="5">Hello</div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 }, 150)
    const promise = layout.layout()

    expect(layout['debounceTimer']).not.toBeNull()

    vi.advanceTimersByTime(150)
    const result = await promise

    expect(result.pages.length).toBeGreaterThanOrEqual(1)
    layout.destroy()
  })

  it('returns cached result when document structure has not changed', async () => {
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="5">Hello</div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 }, 0)
    const first = await layout.layout(true)
    const second = await layout.layout(true)

    expect(second.invalidatedAt).toBe(first.invalidatedAt)
    layout.destroy()
  })

  it('invalidates cache when text content changes', async () => {
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="5">Hello</div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 }, 0)
    const first = await layout.layout(true)

    container.firstElementChild!.textContent = 'Hello world'
    vi.advanceTimersByTime(1)

    const second = await layout.layout(true)
    expect(second.invalidatedAt).not.toBe(first.invalidatedAt)
    layout.destroy()
  })

  it('invalidates cache when text content changes beyond the old truncation limit', async () => {
    const longPrefix = 'a'.repeat(200)
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="${longPrefix.length + 10}">${longPrefix}hello</div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 }, 0)
    const first = await layout.layout(true)

    container.firstElementChild!.textContent = longPrefix + 'world'
    vi.advanceTimersByTime(1)

    const second = await layout.layout(true)
    expect(second.invalidatedAt).not.toBe(first.invalidatedAt)
    layout.destroy()
  })

  it('invalidates cache when the container size changes', async () => {
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="5">Hello</div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 }, 0)
    const first = await layout.layout(true)

    vi.advanceTimersByTime(1)
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ width: 999, height: 999, top: 0, left: 0, right: 999, bottom: 999 }),
      configurable: true,
    })

    const second = await layout.layout(true)
    expect(second.invalidatedAt).not.toBe(first.invalidatedAt)
    layout.destroy()
  })

  it('observes container resize', () => {
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="5">Hello</div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 }, 0)
    const spy = vi.fn()
    globalThis.ResizeObserver = class {
      observe() {
        spy()
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver

    layout.observe(container)
    expect(spy).toHaveBeenCalled()
    layout.destroy()
  })

  it('measures top-level blocks from the editor DOM', () => {
    container = createMockContainer(`
      <div data-node-type="paragraph" data-from="0" data-to="5">Hello</div>
      <div data-node-type="image" data-from="5" data-to="6"><img /></div>
    `)

    const layout = new PageLayout(container, { pageHeight: 100 })
    const blocks = layout.measureBlocks()

    expect(blocks).toHaveLength(2)
    expect(blocks[0].canSplit).toBe(true)
    expect(blocks[1].canSplit).toBe(false)
    expect(blocks[1].nodeType).toBe('image')
    layout.destroy()
  })

  it('measures blocks from a TipTap-like editor DOM via posAtDOM', () => {
    container = createMockContainer(`
      <p>Hello</p>
      <p>World</p>
    `)
    const editorLike = createMockEditorLike(container)

    const layout = new PageLayout(editorLike, { pageHeight: 100 })
    const blocks = layout.measureBlocks()

    expect(blocks.length).toBeGreaterThanOrEqual(2)
    expect(blocks[0].nodeType).toBe('p')
    expect(blocks[0].from).toBeGreaterThanOrEqual(0)
    expect(blocks[0].to).toBeGreaterThan(blocks[0].from)

    layout.destroy()
  })
})
