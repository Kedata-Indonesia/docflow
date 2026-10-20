/**
 * Paste-image plumbing shared by the Edit-menu commands and the native `paste`
 * event. The host's upload port (`onImageUpload`) wins when present; otherwise
 * the image is inlined as a data URL so the demo — and any host that has not
 * wired storage yet — still gets a working paste.
 */
import type { Editor } from '@tiptap/core'
import { readEditorContext } from './editorContext.js'

/** Clipboard image formats the editor can insert without a transcoder. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Larger clipboard images are ignored rather than inlined into the document. */
export const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024

export function isSupportedImageType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_EXTENSIONS, type)
}

function extensionForImageType(type: string): string {
  return IMAGE_EXTENSIONS[type] ?? 'png'
}

/**
 * Normalize a clipboard blob into a `File` the upload port accepts. Returns
 * null for unsupported formats, empty blobs and files above the size ceiling.
 */
export function toPastedImageFile(blob: Blob, name?: string): File | null {
  if (!isSupportedImageType(blob.type) || blob.size === 0 || blob.size > MAX_PASTED_IMAGE_BYTES) {
    return null
  }
  return new File([blob], name || `pasted-image.${extensionForImageType(blob.type)}`, {
    type: blob.type,
  })
}

/** First supported image in a clipboard payload, if any. */
export function pickImageFile(data: DataTransfer | null): File | null {
  if (!data) return null

  for (const file of Array.from(data.files)) {
    const picked = toPastedImageFile(file, file.name)
    if (picked) return picked
  }
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !isSupportedImageType(item.type)) continue
    const file = item.getAsFile()
    if (!file) continue
    const picked = toPastedImageFile(file, file.name)
    if (picked) return picked
  }
  return null
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('FileReader returned a non-string result'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the pasted image'))
    reader.readAsDataURL(file)
  })
}

/**
 * Insert a pasted image at the current selection. Returns false when the image
 * is unsupported/oversized or the host upload rejects — nothing is inserted.
 */
export async function insertPastedImage(editor: Editor, file: File): Promise<boolean> {
  const accepted = toPastedImageFile(file, file.name)
  if (!accepted) return false

  try {
    const upload = readEditorContext(editor)?.onImageUpload
    const src = upload ? (await upload(accepted)).src : await readAsDataUrl(accepted)
    if (!src) return false
    return editor.commands.setImage({ src, alt: accepted.name })
  } catch (error) {
    console.error('[DocsEditor] pasted image could not be inserted:', error)
    return false
  }
}
