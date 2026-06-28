import { describe, it, expect, beforeEach } from 'vitest'
import StarterKit from '@tiptap/starter-kit'
import {
  definePlugin,
  collectExtensions,
  resolveAction,
  createActionMap,
} from '../PluginSystem.js'
import { createEditor } from '../Editor.js'

describe('definePlugin', () => {
  it('returns the plugin definition', () => {
    const plugin = definePlugin({
      id: 'image',
      toolbar: [{ id: 'image', icon: '📷', action: 'insertImage' }],
      slashCommands: [{ name: 'Image', command: 'insertImage' }],
    })
    expect(plugin.id).toBe('image')
    expect(plugin.toolbar?.[0].action).toBe('insertImage')
    expect(plugin.slashCommands?.[0].command).toBe('insertImage')
  })
})

describe('collectExtensions', () => {
  it('collects TipTap extensions from plugins', () => {
    const plugin = definePlugin({
      id: 'starter',
      tiptapExtensions: [StarterKit],
    })
    const extensions = collectExtensions([plugin])
    expect(extensions).toContain(StarterKit)
  })
})

describe('resolveAction', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    target = document.createElement('div')
  })

  it('executes a known TipTap command', () => {
    const { editor } = createEditor({ target, content: '<p>hello</p>' })
    editor.commands.selectAll()
    const result = resolveAction(editor, 'toggleBold')
    expect(result).toBe(true)
    expect(editor.isActive('bold')).toBe(true)
    editor.destroy()
  })

  it('returns false for an unknown action', () => {
    const { editor } = createEditor({ target })
    expect(resolveAction(editor, 'unknownAction')).toBe(false)
    editor.destroy()
  })
})

describe('createActionMap', () => {
  it('maps plugin actions to callable commands', () => {
    const { editor } = createEditor({
      target: document.createElement('div'),
      content: '<p>hello</p>',
    })
    const plugin = definePlugin({
      id: 'formatting',
      toolbar: [{ id: 'bold', action: 'toggleBold' }],
      slashCommands: [{ name: 'Bold', command: 'toggleBold' }],
    })
    const actions = createActionMap(editor, [plugin])
    expect(actions.toggleBold).toBeDefined()
    editor.commands.selectAll()
    expect(actions.toggleBold()).toBe(true)
    expect(editor.isActive('bold')).toBe(true)
    editor.destroy()
  })
})
