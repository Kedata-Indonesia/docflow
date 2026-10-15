import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '../index.js'

describe('fontFamily plugin', () => {
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

  it('setFontFamily applies a font-family to the selection and round-trips through HTML', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<p>Hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 }) // "Hello"

    expect(editor.commands.setFontFamily('Georgia, serif')).toBe(true)

    expect(editor.getAttributes('textStyle').fontFamily).toBe('Georgia, serif')
    expect(editor.getHTML()).toContain('font-family: Georgia, serif')
  })

  it('unsetFontFamily removes only font-family, keeping other textStyle attrs', () => {
    const { editor } = editorInstance
    editor.commands.setContent('<p>Hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })

    editor.commands.setFontFamily('Georgia, serif')
    editor.commands.setFontSize('22px')
    editor.commands.unsetFontFamily()

    const attrs = editor.getAttributes('textStyle')
    expect(attrs.fontFamily).toBeFalsy()
    expect(attrs.fontSize).toBe('22px')
  })
})
