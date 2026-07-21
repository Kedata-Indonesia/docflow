/**
 * Clipboard helpers for the Edit menu. Modern Clipboard API first, with a
 * `document.execCommand` fallback for older browsers / non-secure contexts.
 * Every function degrades gracefully (false / null) instead of throwing —
 * clipboard access is permission-gated and can be denied by the user.
 */

/**
 * Write text (and optionally rich HTML) to the clipboard.
 * Rich write uses ClipboardItem; otherwise plain text via writeText or the
 * legacy execCommand path.
 */
export async function writeClipboard(text: string, html?: string): Promise<boolean> {
  if (typeof document === 'undefined') return false

  try {
    if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })
      await navigator.clipboard.write([item])
      return true
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * Read rich HTML from the clipboard; falls back to plain text if no HTML type
 * is present. Returns null when the API is unavailable or permission denied.
 */
export async function readClipboardHtml(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html')
        return await blob.text()
      }
    }
    for (const item of items) {
      if (item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain')
        return await blob.text()
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Read plain text from the clipboard. Returns null when the API is unavailable
 * or permission denied. (There is no working execCommand('paste') fallback —
 * programmatic paste is restricted in all modern browsers.)
 */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
