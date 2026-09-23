import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createEditor } from '../Editor.js'
import { PAGE_SIZES } from '../pagination/PaginationPlus.js'

const CONTENT = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello pagination.' }] }],
}

const css = (el: HTMLElement, name: string) => el.style.getPropertyValue(name)

// TipTap emits its `create` event (which runs extension `onCreate` hooks, where
// PaginationPlus applies the initial CSS variables) inside a `setTimeout(0)`.
const flushEditorInit = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('PaginationPlus runtime page config', () => {
  let target: HTMLDivElement
  let instance: ReturnType<typeof createEditor>

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    instance?.destroy()
    target.remove()
  })

  const paginationStorage = () =>
    (instance.editor.storage as Record<string, unknown>).PaginationPlus as Record<string, number>

  // Regression guard for the `addStorage()` fix: `PaginationPlus.configure(...)`
  // used to be dropped because storage was pre-seeded with `defaultOptions`, so
  // the pagination algorithm fell back to the defaults (800px) while the drawn
  // page box used the configured size — pages broke in the wrong place.
  it('seeds storage from configured paginationOptions (configure() is not ignored)', async () => {
    instance = createEditor({
      target,
      content: CONTENT,
      plugins: [],
      paginationOptions: { pageHeight: 1234, pageWidth: 777 },
    })
    await flushEditorInit()

    const dom = instance.editor.view.dom as HTMLElement
    expect(paginationStorage().pageHeight).toBe(1234)
    expect(paginationStorage().pageWidth).toBe(777)
    // `onCreate` must draw the page box with the configured dimensions too.
    expect(css(dom, '--rm-page-height')).toBe('1234px')
    expect(css(dom, '--rm-page-width')).toBe('777px')
  })

  it('updatePageHeight/updatePageWidth/updateMargins refresh the --rm-* variables', async () => {
    instance = createEditor({ target, content: CONTENT, plugins: [] })
    const dom = instance.editor.view.dom as HTMLElement

    instance.editor.commands.updatePageHeight(1500)
    instance.editor.commands.updatePageWidth(900)
    instance.editor.commands.updateMargins({ top: 11, bottom: 12, left: 13, right: 14 })

    // The commands may run before TipTap's deferred `create`: `onCreate` must
    // not clobber them back to the option/default values (it used to re-apply
    // its own options-first config).
    await flushEditorInit()

    expect(css(dom, '--rm-page-height')).toBe('1500px')
    expect(css(dom, '--rm-page-width')).toBe('900px')
    expect(css(dom, '--rm-margin-top')).toBe('11px')
    expect(css(dom, '--rm-margin-bottom')).toBe('12px')
    expect(css(dom, '--rm-margin-left')).toBe('13px')
    expect(css(dom, '--rm-margin-right')).toBe('14px')
  })

  // Regression: the runtime commands only mutated `storage`, so the drawn page
  // box kept the dimensions captured once in `onCreate`.
  it('updatePageSize applies every dimension to the --rm-* variables', async () => {
    instance = createEditor({ target, content: CONTENT, plugins: [] })
    const dom = instance.editor.view.dom as HTMLElement
    const a5 = PAGE_SIZES.A5

    instance.editor.commands.updatePageSize(a5)
    await flushEditorInit()

    expect(css(dom, '--rm-page-height')).toBe(`${a5.pageHeight}px`)
    expect(css(dom, '--rm-page-width')).toBe(`${a5.pageWidth}px`)
    expect(css(dom, '--rm-margin-top')).toBe(`${a5.marginTop}px`)
    expect(css(dom, '--rm-margin-bottom')).toBe(`${a5.marginBottom}px`)
    expect(css(dom, '--rm-margin-left')).toBe(`${a5.marginLeft}px`)
    expect(css(dom, '--rm-margin-right')).toBe(`${a5.marginRight}px`)
  })
})
