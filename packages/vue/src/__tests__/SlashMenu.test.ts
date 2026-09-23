import { mount, type VueWrapper } from '@vue/test-utils'
import { markRaw, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEditor } from '@kedata-indonesia/docflow-core'

import SlashMenu from '../components/SlashMenu.vue'

const CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] }

const COMMANDS = [
  { name: 'Rule', command: 'setHorizontalRule' },
  { name: 'Break', command: 'setHardBreak' },
]

const menuElement = () => document.body.querySelector('.docs-slash-menu')

// TipTap emits its `create` event (and thus runs extension `onCreate` hooks)
// inside a `setTimeout(0)`.
const flushEditorInit = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('SlashMenu', () => {
  let target: HTMLDivElement
  let instance: ReturnType<typeof createEditor>
  let wrapper: VueWrapper

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    instance = createEditor({ target, content: CONTENT, plugins: [] })
  })

  afterEach(() => {
    wrapper?.unmount()
    instance?.destroy()
    target.remove()
  })

  // Assert on the document, not the DOM: ProseMirror injects a trailing
  // `<br class="ProseMirror-trailingBreak">` into empty text blocks, so a DOM
  // `querySelector('br')` would "pass" even when no command ran.
  const docJson = () => JSON.stringify(instance.editor.getJSON())
  const blockCount = () => instance.editor.getJSON().content?.length ?? 0

  const mountMenu = () =>
    mount(SlashMenu, {
      // `markRaw` mirrors how `DocsEditor` hands the editor down (a shallowRef /
      // computed chain): a deep-reactive TipTap editor makes every ProseMirror
      // dispatch throw, because transactions built from the proxied state no
      // longer match the raw editor state.
      props: { editor: markRaw(instance.editor), commands: COMMANDS },
    })

  const openMenu = async () => {
    wrapper = mountMenu()
    instance.editor.commands.insertContent('/')
    await flushEditorInit()
    await nextTick()
  }

  // Dispatch from inside the editor DOM so capture/bubble ordering matches the
  // real browser (our listener is capture-phase on `view.dom`).
  const keydown = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    const paragraph = instance.editor.view.dom.querySelector('p')
    expect(paragraph).not.toBeNull()
    paragraph!.dispatchEvent(event)
    return event
  }

  // Regression: `filteredCommands` was only recomputed when `query` changed, so
  // typing a bare '/' opened the menu with an empty list and the template's
  // `filteredCommands.length > 0` guard hid it until a query character was typed.
  it('opens with the full command list on a bare "/"', async () => {
    await openMenu()

    expect(menuElement()).not.toBeNull()
    const items = Array.from(document.body.querySelectorAll('.docs-slash-menu button')).map((b) => b.textContent?.trim())
    expect(items).toEqual(['Rule', 'Break'])
  })

  // Regression: the keydown listener ran in the bubble phase (on `document`),
  // after ProseMirror had already handled Enter and fired `update` → `onTextInput`
  // closed the menu before it could select. It must capture on the editor element.
  it('selects the highlighted command with Enter (keyboard)', async () => {
    await openMenu()
    expect(menuElement()).not.toBeNull()

    keydown('Enter')
    await nextTick()

    expect(docJson()).toContain('horizontalRule')
    expect(instance.editor.view.dom.textContent).not.toContain('/')
    expect(menuElement()).toBeNull()
  })

  it('moves the highlight with ArrowDown before selecting', async () => {
    await openMenu()

    keydown('ArrowDown')
    keydown('Enter')
    await nextTick()

    expect(docJson()).toContain('hardBreak')
    expect(docJson()).not.toContain('horizontalRule')
  })

  // Regression: `props.commands` can shrink while the query stays the same; the
  // highlight used to stay out of range and Enter silently did nothing.
  it('keeps the highlight in range when the command list shrinks', async () => {
    await openMenu()
    keydown('ArrowDown')
    await wrapper.setProps({ commands: [COMMANDS[0]] })
    await nextTick()

    keydown('Enter')
    await nextTick()

    expect(docJson()).toContain('horizontalRule')
    expect(docJson()).not.toContain('hardBreak')
  })

  it('closes without running a command on Escape', async () => {
    await openMenu()

    keydown('Escape')
    await nextTick()

    expect(menuElement()).toBeNull()
    expect(docJson()).not.toContain('horizontalRule')
  })

  // Regression: intercepting while `visible` but with zero matches (`/zzz`
  // renders no menu) swallowed Enter and left the user unable to split a block.
  it('does not swallow Enter when the menu has no matches', async () => {
    await openMenu()
    instance.editor.commands.insertContent('zzz')
    await nextTick()
    expect(menuElement()).toBeNull()

    keydown('Enter')
    await nextTick()

    // ProseMirror must receive the key and split the block. (`defaultPrevented`
    // is not a usable signal: ProseMirror preventDefaults keys it handles too.)
    expect(blockCount()).toBe(2)
  })

  it('leaves Enter to the editor while the menu is closed', () => {
    wrapper = mountMenu()

    keydown('Enter')

    expect(blockCount()).toBe(2)
  })

  it('does not intercept Shift+Enter while the menu is open', async () => {
    await openMenu()

    keydown('Enter', { shiftKey: true })
    await nextTick()

    expect(docJson()).toContain('hardBreak')
    expect(docJson()).not.toContain('horizontalRule')
  })

  // Regression: the Enter that confirms an IME composition must reach the editor
  // instead of running the highlighted command.
  it('ignores the Enter that confirms an IME composition', async () => {
    await openMenu()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'isComposing', { value: true })
    instance.editor.view.dom.querySelector('p')!.dispatchEvent(event)
    await nextTick()

    expect(docJson()).not.toContain('horizontalRule')
  })

  it('detaches its keydown listener and editor handlers on unmount', async () => {
    await openMenu()
    const dom = instance.editor.view.dom
    const removeListener = vi.spyOn(dom, 'removeEventListener')
    const off = vi.spyOn(instance.editor, 'off')

    wrapper.unmount()
    wrapper = undefined as unknown as VueWrapper

    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
    expect(off).toHaveBeenCalledWith('update', expect.any(Function))
    expect(off).toHaveBeenCalledWith('selectionUpdate', expect.any(Function))
    removeListener.mockRestore()
    off.mockRestore()
  })
})
