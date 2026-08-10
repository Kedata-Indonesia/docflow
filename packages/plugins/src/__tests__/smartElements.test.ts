import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { smartElementsPlugin } from '../smartElements.js'

describe('smartElementsPlugin', () => {
  let editorInstance: ReturnType<typeof createEditor>

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    editorInstance = createEditor({ target, plugins: [smartElementsPlugin] })
  })

  afterEach(() => {
    editorInstance.destroy()
    editorInstance.editor.view.dom.parentElement?.remove()
  })

  it('registers all 5 chip node types', () => {
    const names = Object.keys(editorInstance.editor.schema.nodes)
    expect(names).toContain('dateChip')
    expect(names).toContain('peopleChip')
    expect(names).toContain('fileChip')
    expect(names).toContain('dropdownChip')
    expect(names).toContain('locationChip')
  })

  it('inserts a date chip with today’s date', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Before</p>')
    editor.commands.focus('end')

    const result = pluginActions.insertDateChip()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('data-node-type="date-chip"')
    expect(document.querySelector('[data-node-type="date-chip"]')).not.toBeNull()
  })

  it('inserts a people chip via prompt', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Hi</p>')
    editor.commands.focus('end')

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Jane Doe')
    const result = pluginActions.insertPeopleChip()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('data-node-type="people-chip"')
    expect(editor.getHTML()).toContain('Jane Doe')
    expect(document.querySelector('[data-node-type="people-chip"]')).not.toBeNull()
    prompt.mockRestore()
  })

  it('returns false when people prompt is cancelled', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    expect(editorInstance.pluginActions.insertPeopleChip()).toBe(false)
    prompt.mockRestore()
  })

  it('returns false when file prompt is cancelled (empty string)', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('   ')
    expect(editorInstance.pluginActions.insertFileChip()).toBe(false)
    prompt.mockRestore()
  })

  it('inserts a file chip via prompt', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>f</p>')
    editor.commands.focus('end')

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Q4 Report')
    const result = pluginActions.insertFileChip()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('Q4 Report')
    expect(document.querySelector('[data-node-type="file-chip"]')).not.toBeNull()
    prompt.mockRestore()
  })

  it('inserts a dropdown chip with default statuses', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Status:</p>')
    editor.commands.focus('end')

    const result = pluginActions.insertDropdownChip()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('data-node-type="dropdown-chip"')
    expect(editor.getHTML()).toContain('To Do')
    expect(document.querySelector('[data-node-type="dropdown-chip"] select')).not.toBeNull()
  })

  it('inserts a location chip via prompt', () => {
    const { editor, pluginActions } = editorInstance
    editor.commands.focus()
    editor.commands.insertContent('<p>Meet at</p>')
    editor.commands.focus('end')

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Jakarta')
    const result = pluginActions.insertLocationChip()
    expect(result).toBe(true)
    expect(editor.getHTML()).toContain('Jakarta')
    expect(document.querySelector('[data-node-type="location-chip"]')).not.toBeNull()
    prompt.mockRestore()
  })

  it('returns false when location prompt is cancelled', () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    expect(editorInstance.pluginActions.insertLocationChip()).toBe(false)
    prompt.mockRestore()
  })
})