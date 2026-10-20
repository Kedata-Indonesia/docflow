import { computed, onUnmounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import type { ToolbarItem } from '@kedata-indonesia/docflow-core'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from 'lucide-vue-next'
import { DEFAULT_FONT_STACK, FONT_OPTIONS } from '../components/toolbar/toolbarConfig.js'
import { isToolbarItemActive } from '../components/toolbar/toolbarCommands.js'

/**
 * Owns the single editor `transaction` subscription used by the toolbar and
 * exposes the selection-derived state every control reads. Child components
 * receive `selectionTick` as a prop so they re-render without attaching their
 * own listener.
 */
export function useToolbarSelection(getEditor: () => Editor | null) {
  const selectionTick = ref(0)

  function handleTransaction() {
    selectionTick.value++
  }

  watch(
    getEditor,
    (newEditor, oldEditor) => {
      if (oldEditor) {
        oldEditor.off('transaction', handleTransaction)
      }
      if (newEditor) {
        newEditor.on('transaction', handleTransaction)
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    getEditor()?.off('transaction', handleTransaction)
  })

  function isItemActive(item: ToolbarItem): boolean {
    // Establish reactive dependency
    void selectionTick.value
    return isToolbarItemActive(getEditor(), item)
  }

  const currentTextColor = computed(() => {
    void selectionTick.value
    return getEditor()?.getAttributes('textStyle').color as string | undefined
  })

  const currentHighlightColor = computed(() => {
    void selectionTick.value
    const highlight = getEditor()?.getAttributes('highlight')
    if (highlight?.color) return highlight.color as string
    if (getEditor()?.isActive('highlight')) return '#ffff00' // default yellow
    return undefined
  })

  const currentAlignIcon = computed(() => {
    void selectionTick.value
    const editor = getEditor()
    if (editor) {
      if (editor.isActive({ textAlign: 'center' })) return AlignCenter
      if (editor.isActive({ textAlign: 'right' })) return AlignRight
      if (editor.isActive({ textAlign: 'justify' })) return AlignJustify
    }
    return AlignLeft
  })

  const currentParagraphStyle = computed(() => {
    // Establish reactive dependency
    void selectionTick.value
    const editor = getEditor()
    if (!editor) return 'paragraph'
    for (let level = 1; level <= 6; level++) {
      if (editor.isActive('heading', { level })) return `heading-${level}`
    }
    return 'paragraph'
  })

  /** Reactively read the font family from the current selection's TextStyle mark. */
  const currentFont = computed<string>(() => {
    void selectionTick.value
    const attrs = getEditor()?.getAttributes('textStyle')
    return (attrs?.fontFamily as string | undefined) || DEFAULT_FONT_STACK
  })

  const currentFontLabel = computed(() => {
    const match = FONT_OPTIONS.find((o) => o.value === currentFont.value)
    if (match) return match.label
    // Stored family from a paste / older doc that isn't in the list — show its
    // first family name rather than a misleading default.
    const first = (currentFont.value || '').split(',')[0].trim().replace(/^["']|["']$/g, '')
    return first || 'Inter'
  })

  return {
    selectionTick,
    isItemActive,
    currentTextColor,
    currentHighlightColor,
    currentAlignIcon,
    currentParagraphStyle,
    currentFont,
    currentFontLabel,
  }
}
