import { computed, ref } from 'vue'
import type { Editor } from '@tiptap/core'
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from '../components/toolbar/toolbarConfig.js'

interface FontSizeCommands {
  setFontSize: (size: string) => boolean
}

function setFontSize(editor: Editor, size: string) {
  ;(editor.commands as unknown as FontSizeCommands).setFontSize(size)
}

/**
 * Font-size stepper state. Kept as one unit because the ladder, draft value and
 * commit/cancel handlers share the same invariants (#158, #143).
 */
export function useFontSize(getEditor: () => Editor | null, getSelectionTick: () => number) {
  /** Reactively read the font-size from the current selection's TextStyle mark. */
  const currentFontSize = computed<number>(() => {
    void getSelectionTick()
    const editor = getEditor()
    if (!editor) return DEFAULT_FONT_SIZE

    // Check document textStyle mark at selection first
    const attrs = editor.getAttributes('textStyle')
    if (attrs?.fontSize) {
      const parsed = parseInt(attrs.fontSize, 10)
      if (!isNaN(parsed)) return parsed
    }

    // Check stored marks (marks set at cursor position but not yet applied)
    const storedMarks = editor.state.storedMarks
    if (storedMarks) {
      for (const mark of storedMarks) {
        if (mark.type.name === 'textStyle' && mark.attrs.fontSize) {
          const parsed = parseInt(mark.attrs.fontSize as string, 10)
          if (!isNaN(parsed)) return parsed
        }
      }
    }

    // Headings take their size from CSS, not a textStyle mark, so the control
    // would otherwise report the body size (#143). Reflect the heading's real
    // size for H1–H3; H4–H6 have no explicit size, so they fall through to base.
    const HEADING_FONT_SIZES: Record<number, number> = { 1: 30, 2: 24, 3: 20 }
    for (const level of [1, 2, 3]) {
      if (editor.isActive('heading', { level })) return HEADING_FONT_SIZES[level]
    }

    // Fallback: read actual rendered font size from the DOM
    if (editor.view?.dom) {
      const baseSize = parseFloat(getComputedStyle(editor.view.dom).fontSize)
      if (!isNaN(baseSize)) {
        const px = Math.round(baseSize)
        // Clamp to nearest FONT_SIZE
        const nearest = FONT_SIZES.reduce((prev, curr) =>
          Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev,
        )
        return nearest
      }
    }

    return DEFAULT_FONT_SIZE
  })

  function handleFontSize(delta: number) {
    const editor = getEditor()
    if (!editor) return
    const current = currentFontSize.value
    const idx = FONT_SIZES.indexOf(current)
    let nextSize: number
    if (idx >= 0) {
      nextSize = FONT_SIZES[Math.min(Math.max(idx + delta, 0), FONT_SIZES.length - 1)]
    } else if (delta < 0) {
      // Non-preset size (typed manually): step to the nearest preset below.
      nextSize = [...FONT_SIZES].reverse().find((s) => s < current) ?? FONT_SIZES[0]
    } else {
      // Non-preset size: step to the nearest preset above. Sizes beyond the
      // largest preset have no step up, so keep the current size.
      nextSize = FONT_SIZES.find((s) => s > current) ?? current
    }
    // Use direct command (not chain) to avoid chaining-proxy conflict with the
    // inner setMark calls inside FontSizeExtension.
    setFontSize(editor, `${nextSize}px`)
    editor.commands.focus()
  }

  /** Non-null while the user is typing into the font-size box. */
  const fontSizeDraft = ref<string | null>(null)

  function onFontSizeFocus(event: FocusEvent) {
    fontSizeDraft.value = String(currentFontSize.value)
    ;(event.target as HTMLInputElement).select()
  }

  function onFontSizeInput(event: Event) {
    fontSizeDraft.value = (event.target as HTMLInputElement).value
  }

  function applyFontSize(size: number) {
    const editor = getEditor()
    if (!editor) return
    const clamped = Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE)
    setFontSize(editor, `${clamped}px`)
  }

  function commitFontSize(event: FocusEvent) {
    const parsed = parseInt((event.target as HTMLInputElement).value, 10)
    if (!isNaN(parsed) && parsed !== currentFontSize.value) {
      applyFontSize(parsed)
    }
    fontSizeDraft.value = null
    getEditor()?.commands.focus()
  }

  function cancelFontSize(event: KeyboardEvent) {
    fontSizeDraft.value = null
    // Restore the displayed value before blurring so the blur handler's commit
    // sees no change and does not apply the discarded input.
    const input = event.target as HTMLInputElement
    input.value = String(currentFontSize.value)
    input.blur()
    getEditor()?.commands.focus()
  }

  return {
    currentFontSize,
    handleFontSize,
    fontSizeDraft,
    onFontSizeFocus,
    onFontSizeInput,
    applyFontSize,
    commitFontSize,
    cancelFontSize,
  }
}
