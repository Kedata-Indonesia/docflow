import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor as TiptapEditor, Node } from '@tiptap/core'
import { createEditor } from '../Editor.js'
import { definePlugin } from '../PluginSystem.js'

const DemoImageNode = Node.create({
  name: 'demoImage',
  group: 'block',
  parseHTML() {
    return [{ tag: 'img[data-demo-image="true"]' }]
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ['img', { ...HTMLAttributes, src: 'demo.png', 'data-demo-image': 'true' }]
  },
})

describe('createEditor', () => {
  let target: HTMLDivElement
  let editor: ReturnType<typeof createEditor>

  beforeEach(() => {
    target = document.createElement('div')
  })

  afterEach(() => {
    editor?.destroy()
    editor = undefined as unknown as ReturnType<typeof createEditor>
  })

  it('creates a TipTap editor instance', () => {
    editor = createEditor({ target })
    expect(editor.editor).toBeInstanceOf(TiptapEditor)
  })

  it('returns JSON content via getJSON()', () => {
    editor = createEditor({ target, content: '<p>Hello world</p>' })
    const json = editor.getJSON() as Record<string, unknown>
    expect(json.type).toBe('doc')
    expect(Array.isArray(json.content)).toBe(true)
    expect((json.content as Record<string, unknown>[])[0].type).toBe('paragraph')
  })

  it('returns HTML content via getHTML()', () => {
    editor = createEditor({ target, content: '<p>Hello world</p>' })
    expect(editor.getHTML()).toContain('Hello world')
  })

  it('destroys without error', () => {
    editor = createEditor({ target })
    expect(() => editor.destroy()).not.toThrow()
  })

  it('supports use(plugin) to register a plugin at runtime', () => {
    editor = createEditor({ target })
    const plugin = definePlugin({
      id: 'runtime',
      toolbar: [{ id: 'demo', label: 'Demo', action: 'insertContent' }],
    })
    expect(() => editor.use(plugin)).not.toThrow()
    expect(editor.pluginActions.insertContent).toBeDefined()
  })

  it('makes plugin actions callable after use(plugin)', () => {
    editor = createEditor({ target, content: '<p>Hello</p>' })
    const plugin = definePlugin({
      id: 'runtime',
      toolbar: [{ id: 'demo', label: 'Demo', action: 'insertContent' }],
    })
    editor.use(plugin)
    editor.editor.commands.focus('end')
    const result = editor.pluginActions.insertContent(' world')
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('Hello world')
  })

  it('registers extensions from a plugin added at runtime', () => {
    editor = createEditor({ target, content: '<p>Hello</p>' })
    const plugin = definePlugin({
      id: 'image-runtime',
      tiptapExtensions: [DemoImageNode],
      toolbar: [{ id: 'demo-image', label: 'Demo Image', action: 'insertDemoImage' }],
      commands: {
        insertDemoImage: (ed) => ed.commands.insertContent({ type: 'demoImage' }),
      },
    })
    editor.use(plugin)
    editor.editor.commands.focus('end')
    const result = editor.pluginActions.insertDemoImage()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('demo.png')
  })

  it('calls onUpdate when content changes', () => {
    let updated: object | undefined
    editor = createEditor({
      target,
      content: '<p>Initial</p>',
      onUpdate: (json) => {
        updated = json
      },
    })
    editor.editor.commands.focus('end')
    editor.editor.commands.insertContent(' updated')
    expect(updated).toBeDefined()
    expect((updated as Record<string, unknown>).type).toBe('doc')
  })
})
