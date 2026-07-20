import { describe, it, expect, vi, afterEach } from 'vitest'
import { createEditor } from '../Editor.js'
import { resolveSignalingUrls } from '../Collaboration.js'
import type { ImageUploadHandler } from '../ports.js'

describe('EditorContextExtension (host-injected ports)', () => {
  let target: HTMLDivElement

  afterEach(() => {
    target?.remove()
  })

  it('exposes onImageUpload via editor storage', () => {
    target = document.createElement('div')
    const onImageUpload: ImageUploadHandler = async (file) => ({ src: `blob:${file.name}` })
    const instance = createEditor({ target, onImageUpload })

    const context = (instance.editor.storage as Record<string, { onImageUpload?: ImageUploadHandler }>).editorContext
    expect(context.onImageUpload).toBe(onImageUpload)
    instance.destroy()
  })

  it('registers undefined when no handler is provided', () => {
    target = document.createElement('div')
    const instance = createEditor({ target })

    const context = (instance.editor.storage as Record<string, { onImageUpload?: ImageUploadHandler }>).editorContext
    expect(context.onImageUpload).toBeUndefined()
    instance.destroy()
  })
})

describe('resolveSignalingUrls (self-host-safe webrtc defaults)', () => {
  it('passes through an explicit signaling list untouched', () => {
    const custom = ['wss://signal.example.internal']
    expect(resolveSignalingUrls(custom)).toBe(custom)
  })

  it('falls back to localhost-only and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const first = resolveSignalingUrls(undefined)
    expect(first).toEqual(['ws://localhost:4444'])
    // No public signaling host may ever appear in the fallback.
    expect(first.join(' ')).not.toMatch(/yjs\.dev|fly\.dev/)

    const warnedOnce = warn.mock.calls.length
    expect(warnedOnce).toBeGreaterThanOrEqual(1)

    resolveSignalingUrls([])
    resolveSignalingUrls(undefined)
    expect(warn.mock.calls.length).toBe(warnedOnce) // one-time warning

    warn.mockRestore()
  })
})
