import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import { imagePlugin } from '@kedata-indonesia/docflow-plugins'
import DocsEditor from '../components/DocsEditor.vue'

/**
 * Regression tests for #296 — an image-only clipboard (a screenshot, or
 * “Copy image”) must insert through the host upload port on a plain Ctrl/Cmd+V,
 * while a rich HTML paste keeps going through the existing sanitizer.
 */

type EditorHost = {
  editor?: { view: { dom: HTMLElement } }
}

function pasteEvent(files: File[], types: string[]): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      types,
      files,
      items: [],
      getData: (type: string) => (type === 'text/html' ? '<p>rich</p>' : ''),
    },
  })
  return event
}

function pngFile(): File {
  return new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' })
}

async function mountEditor(onImageUpload: (file: File) => Promise<{ src: string }>) {
  const wrapper = mount(DocsEditor, {
    attachTo: document.body,
    props: { plugins: [imagePlugin as DocsEditorPlugin], onImageUpload },
  })
  await wrapper.vm.$nextTick()
  const dom = (wrapper.vm as unknown as EditorHost).editor?.view.dom
  if (!dom) throw new Error('editor was not created')
  return { wrapper, dom }
}

describe('DocsEditor image paste (#296)', () => {
  it('uploads and inserts an image-only clipboard paste', async () => {
    const upload = vi.fn().mockResolvedValue({ src: 'https://cdn.test/shot.png' })
    const { wrapper, dom } = await mountEditor(upload)

    dom.dispatchEvent(pasteEvent([pngFile()], ['Files']))

    await vi.waitFor(() => {
      expect(dom.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/shot.png')
    })
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0][0]).toMatchObject({ name: 'shot.png', type: 'image/png' })

    wrapper.unmount()
  })

  it('leaves a rich HTML paste to the editor', async () => {
    const upload = vi.fn().mockResolvedValue({ src: 'https://cdn.test/ignored.png' })
    const { wrapper, dom } = await mountEditor(upload)

    dom.dispatchEvent(pasteEvent([pngFile()], ['text/html', 'Files']))
    await wrapper.vm.$nextTick()

    expect(upload).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
