import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { collectExtensions, createEditor, type DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import {
  defaultPlugins,
  formattingPlugin,
  linkPlugin,
  imagePlugin,
  tablePlugin,
  headingsPlugin,
  listsPlugin,
  alignmentPlugin,
  blockquotePlugin,
  codeBlockPlugin,
  placeholderPlugin,
  pageBreakPlugin,
} from '../index.js'

describe('defaultPlugins', () => {
  it('collects extensions from all default plugins', () => {
    const extensions = collectExtensions(defaultPlugins)
    expect(extensions.length).toBeGreaterThan(0)
  })

  it('exports every required plugin', () => {
    const plugins: DocsEditorPlugin[] = [
      formattingPlugin,
      headingsPlugin,
      listsPlugin,
      alignmentPlugin,
      linkPlugin,
      imagePlugin,
      tablePlugin,
      blockquotePlugin,
      codeBlockPlugin,
      placeholderPlugin,
      pageBreakPlugin,
    ]
    expect(plugins.every((p) => p.id && p.id.length > 0)).toBe(true)
  })

  it('exposes expected action names in toolbar items', () => {
    const requiredActions = [
      'toggleBold',
      'toggleItalic',
      'toggleUnderline',
      'toggleStrike',
      'toggleHeading1',
      'toggleHeading2',
      'toggleHeading3',
      'toggleHeading4',
      'toggleHeading5',
      'toggleHeading6',
      'toggleBulletList',
      'toggleOrderedList',
      'toggleTaskList',
      'alignLeft',
      'alignCenter',
      'alignRight',
      'alignJustify',
      'setLink',
      'insertImage',
      'insertTable',
      'toggleBlockquote',
      'toggleCodeBlock',
      'insertPageBreak',
    ]

    const actions = defaultPlugins.flatMap((plugin) => plugin.toolbar?.map((item) => item.action) ?? [])
    for (const action of requiredActions) {
      expect(actions).toContain(action)
    }
  })
})

describe('createEditor with defaultPlugins', () => {
  let editorInstance: ReturnType<typeof createEditor>

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editorInstance = createEditor({ target, plugins: defaultPlugins })
  })

  afterEach(() => {
    editorInstance.destroy()
    editorInstance.editor.view.dom.parentElement?.remove()
  })

  it('toggles bold', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('Hello world')
    editor.commands.selectAll()

    const result = pluginActions.toggleBold()
    expect(result).toBe(true)
    expect(editor.isActive('bold')).toBe(true)
  })

  it('inserts a link', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('Click here')
    editor.commands.selectAll()

    const result = pluginActions.setLink({ href: 'https://example.com' })
    expect(result).toBe(true)
    expect(editor.isActive('link', { href: 'https://example.com' })).toBe(true)
  })

  it('toggles a heading with default level from the toolbar action', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('Title')
    editor.commands.selectAll()

    const result = pluginActions.toggleHeading1()
    expect(result).toBe(true)
    expect(editor.isActive('heading', { level: 1 })).toBe(true)
  })

  it('sets text alignment from the toolbar action', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('Centered')
    editor.commands.selectAll()

    const result = pluginActions.alignCenter()
    expect(result).toBe(true)
    expect(editor.isActive({ textAlign: 'center' })).toBe(true)
  })

  it('inserts an image via the URL prompt fallback when no upload handler is set', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Before</p>')
    editor.commands.focus('end')

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('https://example.com/pic.png')
    const result = pluginActions.insertImage()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('https://example.com/pic.png')
    // The library never names a storage host anymore.
    expect(editor.getHTML()).not.toContain('placeholder.com')
    prompt.mockRestore()
  })

  it('returns false when the URL prompt is cancelled', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    expect(editorInstance.pluginActions.insertImage()).toBe(false)
    prompt.mockRestore()
  })

  it('inserts an image via the injected onImageUpload port', async () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const uploaded = vi.fn(async (file: File) => ({ src: `https://cdn.local/${file.name}` }))
    const instance = createEditor({ target, plugins: defaultPlugins, onImageUpload: uploaded })

    // Simulate the file picker returning a file.
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const realCreate = document.createElement.bind(document)
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((
      tag: string,
      options?: ElementCreationOptions,
    ) => {
      const el = realCreate(tag as 'div', options)
      if (tag === 'input') {
        const input = el as HTMLInputElement
        input.click = () => {
          Object.defineProperty(input, 'files', { value: [file], configurable: true })
          input.onchange?.(new Event('change'))
        }
      }
      return el
    }) as typeof document.createElement)

    const result = instance.pluginActions.insertImage()
    expect(result).toBe(true) // command returns immediately; insertion is async

    await vi.waitFor(() => {
      expect(uploaded).toHaveBeenCalledWith(file)
      expect(instance.editor.getHTML()).toContain('https://cdn.local/photo.png')
    })

    createSpy.mockRestore()
    instance.destroy()
    target.remove()
  })

  it('inserts a table and renders a visible table element', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Before</p>')
    editor.commands.focus('end')

    const result = pluginActions.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('<table')
    expect(document.querySelector('table')).not.toBeNull()
  })

  it('inserts a page break and renders a visible indicator', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Before</p>')
    editor.commands.focus('end')

    const result = pluginActions.insertPageBreak()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('data-page-break')
    expect(document.querySelector('[data-page-break="true"]')).not.toBeNull()
  })
})
