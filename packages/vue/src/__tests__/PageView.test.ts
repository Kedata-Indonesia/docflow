import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Editor } from '@tiptap/core'
import type { Page } from '@kedata-indonesia/docflow-layout-engine'
import PageView from '../components/PageView.vue'

function createMockEditor(html: string): { editor: Editor; container: HTMLElement } {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)

  const editor = {
    view: {
      dom: container,
      domAtPos: (pos: number) => {
        const text = container.querySelector('[data-from]')?.firstChild as Text | null
        if (!text) return null
        return { node: text, offset: Math.min(pos, text.length ?? 0) }
      },
    },
  } as unknown as Editor

  return { editor, container }
}

describe('PageView', () => {
  it('renders pages with A4 dimensions by default', () => {
    const pages: Page[] = [
      {
        from: 0,
        to: 5,
        blocks: [
          {
            nodeType: 'paragraph',
            from: 0,
            to: 5,
            top: 0,
            bottom: 20,
            canSplit: true,
          },
        ],
      },
    ]

    const wrapper = mount(PageView, {
      props: { pages },
    })

    const page = wrapper.find('.docs-editor-page')
    expect(page.exists()).toBe(true)
    expect((page.element as HTMLElement).style.width).toBe('794px')
    expect((page.element as HTMLElement).style.height).toBe('1123px')
    expect((page.element as HTMLElement).style.paddingTop).toBe('96px')
    wrapper.unmount()
  })

  it('uses custom layout options when provided', () => {
    const pages: Page[] = [
      {
        from: 0,
        to: 5,
        blocks: [
          {
            nodeType: 'paragraph',
            from: 0,
            to: 5,
            top: 0,
            bottom: 20,
            canSplit: true,
          },
        ],
      },
    ]

    const wrapper = mount(PageView, {
      props: {
        pages,
        layoutOptions: {
          pageWidth: 500,
          pageHeight: 700,
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
        },
      },
    })

    const page = wrapper.find('.docs-editor-page')
    expect((page.element as HTMLElement).style.width).toBe('500px')
    expect((page.element as HTMLElement).style.height).toBe('700px')
    expect((page.element as HTMLElement).style.paddingLeft).toBe('50px')
    wrapper.unmount()
  })

  it('renders split block content per page', () => {
    const { editor } = createMockEditor(
      '<p data-from="0" data-to="11" data-node-type="paragraph">Hello world</p>',
    )

    const pages: Page[] = [
      {
        from: 0,
        to: 5,
        blocks: [
          {
            nodeType: 'paragraph',
            from: 0,
            to: 5,
            top: 0,
            bottom: 20,
            canSplit: true,
          },
        ],
      },
      {
        from: 5,
        to: 11,
        blocks: [
          {
            nodeType: 'paragraph',
            from: 5,
            to: 11,
            top: 20,
            bottom: 40,
            canSplit: true,
          },
        ],
      },
    ]

    const wrapper = mount(PageView, {
      props: { pages, editor },
    })

    const pageBlocks = wrapper.findAll('.docs-editor-page__block-content')
    expect(pageBlocks).toHaveLength(2)
    expect(pageBlocks[0].text()).toContain('Hello')
    expect(pageBlocks[1].text()).toContain('world')
    expect(pageBlocks[0].text()).not.toContain('world')
    wrapper.unmount()
  })
})
