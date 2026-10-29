import type { Ref } from 'vue'

/**
 * Element refs the page surface binds into its DOM. A plain object (not three
 * separate props) because Vue unwraps refs passed directly from a template —
 * the bundle keeps the `Ref` objects intact so `DocsEditor`'s composables and
 * the child element share the same refs.
 */
export interface DocsEditorPaperRefs {
  scroll: Ref<HTMLElement | null>
  surface: Ref<HTMLElement | null>
  editor: Ref<HTMLElement | null>
}
