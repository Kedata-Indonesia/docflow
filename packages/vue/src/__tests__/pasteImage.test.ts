import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PASTED_IMAGE_BYTES,
  insertPastedImage,
  pickImageFile,
  toPastedImageFile,
} from '../composables/pasteImage.js'

interface FakeEditor {
  storage: {
    editorContext?: {
      onImageUpload?: (file: File) => Promise<{ src: string }>
    }
  }
  commands: {
    setImage: (attrs: { src: string; alt?: string }) => boolean
  }
}

function asEditor(fake: FakeEditor): Editor {
  return fake as unknown as Editor
}

function imageFile(name = 'shot.png', type = 'image/png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type })
}

describe('pasteImage helpers (#296)', () => {
  it('toPastedImageFile keeps supported images and derives the extension', () => {
    const fromClipboard = toPastedImageFile(imageFile())
    expect(fromClipboard?.name).toBe('pasted-image.png')
    expect(fromClipboard?.type).toBe('image/png')

    const named = toPastedImageFile(imageFile(), 'shot.png')
    expect(named?.name).toBe('shot.png')
  })

  it('toPastedImageFile rejects unsupported, empty and oversized images', () => {
    expect(toPastedImageFile(imageFile('doc.pdf', 'application/pdf'))).toBeNull()
    expect(toPastedImageFile(new File([], 'empty.png', { type: 'image/png' }))).toBeNull()

    const oversized = imageFile('big.png')
    Object.defineProperty(oversized, 'size', { value: MAX_PASTED_IMAGE_BYTES + 1 })
    expect(toPastedImageFile(oversized)).toBeNull()
  })

  it('pickImageFile reads clipboard files and falls back to items', () => {
    const fromFiles = pickImageFile({ files: [imageFile()], items: [] } as unknown as DataTransfer)
    expect(fromFiles?.type).toBe('image/png')

    const fromItems = pickImageFile({
      files: [],
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/webp', getAsFile: () => imageFile('item.webp', 'image/webp') },
      ],
    } as unknown as DataTransfer)
    expect(fromItems?.type).toBe('image/webp')

    expect(pickImageFile(null)).toBeNull()
  })

  it('insertPastedImage uses the host upload port when present', async () => {
    const upload = vi.fn().mockResolvedValue({ src: 'https://cdn.test/shot.png' })
    const setImage = vi.fn().mockReturnValue(true)
    const editor = asEditor({ storage: { editorContext: { onImageUpload: upload } }, commands: { setImage } })

    await expect(insertPastedImage(editor, imageFile())).resolves.toBe(true)
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0][0]).toMatchObject({ name: 'shot.png', type: 'image/png' })
    expect(setImage).toHaveBeenCalledWith({ src: 'https://cdn.test/shot.png', alt: 'shot.png' })
  })

  it('insertPastedImage falls back to a data URL without an upload port', async () => {
    const setImage = vi.fn().mockReturnValue(true)
    const editor = asEditor({ storage: {}, commands: { setImage } })

    await expect(insertPastedImage(editor, imageFile())).resolves.toBe(true)
    const attrs = setImage.mock.calls[0][0] as { src: string }
    expect(attrs.src.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('insertPastedImage inserts nothing when the host upload rejects', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('offline'))
    const setImage = vi.fn()
    const editor = asEditor({ storage: { editorContext: { onImageUpload: upload } }, commands: { setImage } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(insertPastedImage(editor, imageFile())).resolves.toBe(false)
    expect(setImage).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
