import { describe, it, expect, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { codeBlockPlugin } from '../codeBlock.js'

type Instance = ReturnType<typeof createEditor>

function makeEditor(): { instance: Instance; target: HTMLDivElement } {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = createEditor({ target, plugins: [codeBlockPlugin] })
  return { instance, target }
}

describe('codeBlockPlugin (#247)', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
  })

  function mount() {
    const mounted = makeEditor()
    cleanup = () => {
      mounted.instance.destroy()
      mounted.target.remove()
    }
    return mounted
  }

  it('persists the language attribute and renders highlighted tokens', () => {
    const { instance, target } = mount()
    instance.editor.chain().focus().setCodeBlock({ language: 'javascript' }).run()
    instance.editor.commands.insertContent('const x = 1')

    expect(JSON.stringify(instance.editor.getJSON())).toContain('"language":"javascript"')

    const code = target.querySelector('pre code') as HTMLElement | null
    expect(code).not.toBeNull()
    expect(code!.className).toContain('language-javascript')
    expect(target.querySelector('.hljs-keyword, .hljs-string')).not.toBeNull()
  })

  it('updates the language via updateAttributes and round-trips HTML', () => {
    const { instance } = mount()
    instance.editor.chain().focus().setCodeBlock({ language: 'plaintext' }).run()
    instance.editor.commands.insertContent('print("hi")')
    instance.editor.commands.updateAttributes('codeBlock', { language: 'python' })

    const html = instance.editor.getHTML()
    expect(html).toContain('language-python')

    instance.editor.commands.setContent(html)
    expect(JSON.stringify(instance.editor.getJSON())).toContain('"language":"python"')
  })

  it('keeps plaintext blocks unlabelled', () => {
    const { instance, target } = mount()
    instance.editor.chain().focus().setCodeBlock().run()
    instance.editor.commands.insertContent('just text')

    const code = target.querySelector('pre code') as HTMLElement | null
    expect(code).not.toBeNull()
    expect(code!.className).not.toContain('language-')
  })
})
