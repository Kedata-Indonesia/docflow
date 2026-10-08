import { onUnmounted, ref, watch } from 'vue'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import type { SidebarKey } from '../types.js'

export interface UseEditorChromeOptions {
  /** The editor is created after this composable; read it lazily. */
  getEditor: () => DocsEditor['editor'] | null
}

/**
 * Editor chrome state: active sidebar, the view-menu toggles (persisted ruler
 * visibility + focus mode), the scroll container with its debounced scroll
 * handler, and the sidebar-toggle / print helpers. Extracted verbatim from
 * DocsEditor so the component stays lean.
 */
export function useEditorChrome(options: UseEditorChromeOptions) {
  const { getEditor } = options

  const activeSidebar = ref<SidebarKey | null>(null)
  // View menu toggles — ruler visibility persists across sessions, focus mode does not.
  // Guarded for SSR / environments without Web Storage (Node >= 26 exposes no
  // `localStorage` unless started with `--localstorage-file`).
  const showRuler = ref(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('docflow:view:showRuler') !== 'false'
      : true,
  )
  const focusMode = ref(false)
  watch(showRuler, (next) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('docflow:view:showRuler', next ? 'true' : 'false')
    }
  })

  const scrollContainerRef = ref<HTMLDivElement | null>(null)
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null

  const handleScroll = () => {
    if (!getEditor()) return
    if (scrollTimeout) clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => {
      const editor = getEditor()
      if (editor) {
        editor.view.dispatch(editor.state.tr)
      }
    }, 150)
  }

  onUnmounted(() => {
    if (scrollTimeout) clearTimeout(scrollTimeout)
  })

  const toggleSidebar = (key: SidebarKey) => { activeSidebar.value = activeSidebar.value === key ? null : key }
  const handlePrint = () => window.print()

  return {
    activeSidebar,
    showRuler,
    focusMode,
    scrollContainerRef,
    handleScroll,
    toggleSidebar,
    handlePrint,
  }
}
