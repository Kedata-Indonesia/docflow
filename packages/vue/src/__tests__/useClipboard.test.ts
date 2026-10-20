import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  writeClipboard,
  readClipboardHtml,
  readClipboardText,
  readClipboardImage,
} from '../composables/useClipboard.js'

describe('useClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('writeClipboard uses the rich ClipboardItem path when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    class FakeClipboardItem {
      constructor(public items: unknown) {}
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)

    const ok = await writeClipboard('plain', '<b>rich</b>')
    expect(ok).toBe(true)
    expect(write).toHaveBeenCalledOnce()
  })

  it('writeClipboard falls back to writeText without ClipboardItem', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('ClipboardItem', undefined)

    const ok = await writeClipboard('plain', '<b>rich</b>')
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledWith('plain')
  })

  it('writeClipboard falls back to execCommand when the API is absent', async () => {
    vi.stubGlobal('navigator', {})
    const exec = vi.fn().mockReturnValue(true)
    document.execCommand = exec as typeof document.execCommand

    const ok = await writeClipboard('legacy')
    expect(ok).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('readClipboardText returns null when the API is absent', async () => {
    vi.stubGlobal('navigator', {})
    expect(await readClipboardText()).toBeNull()
  })

  it('readClipboardText returns text when permitted', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockResolvedValue('hello') } })
    expect(await readClipboardText()).toBe('hello')
  })

  it('readClipboardText returns null when permission is denied', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) } })
    expect(await readClipboardText()).toBeNull()
  })

  it('readClipboardHtml prefers text/html', async () => {
    const htmlBlob = { text: vi.fn().mockResolvedValue('<p>rich</p>') }
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn().mockResolvedValue([
          { types: ['text/html'], getType: vi.fn().mockResolvedValue(htmlBlob) },
        ]),
      },
    })
    expect(await readClipboardHtml()).toBe('<p>rich</p>')
  })

  it('readClipboardHtml falls back to text/plain', async () => {
    const textBlob = { text: vi.fn().mockResolvedValue('plain') }
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn().mockResolvedValue([
          { types: ['text/plain'], getType: vi.fn().mockResolvedValue(textBlob) },
        ]),
      },
    })
    expect(await readClipboardHtml()).toBe('plain')
  })

  it('readClipboardHtml returns null when the API is absent', async () => {
    vi.stubGlobal('navigator', {})
    expect(await readClipboardHtml()).toBeNull()
  })

  it('readClipboardImage returns the first supported image as a File', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn().mockResolvedValue([
          {
            types: ['text/plain', 'image/png'],
            getType: vi.fn(async (type: string) =>
              type === 'image/png' ? png : new Blob(['x'], { type: 'text/plain' }),
            ),
          },
        ]),
      },
    })

    const file = await readClipboardImage()
    expect(file?.type).toBe('image/png')
    expect(file?.name).toBe('pasted-image.png')
  })

  it('readClipboardImage skips unsupported image formats', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        read: vi.fn().mockResolvedValue([
          {
            types: ['image/svg+xml'],
            getType: vi.fn().mockResolvedValue(new Blob(['<svg />'], { type: 'image/svg+xml' })),
          },
        ]),
      },
    })
    expect(await readClipboardImage()).toBeNull()
  })

  it('readClipboardImage returns null when permission is denied', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { read: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    expect(await readClipboardImage()).toBeNull()
  })
})
