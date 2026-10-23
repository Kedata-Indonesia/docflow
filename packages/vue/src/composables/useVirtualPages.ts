import { ref, onUnmounted, unref, watch, computed, type Ref } from 'vue'
import { VirtualPageOverlay, type PageOverlayConfig, type PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'

export interface UseVirtualPagesOptions {
  editorRef: Ref<{ view: { dom: HTMLElement } } | null>
  scrollRef: Ref<HTMLElement | null>
  /**
   * Plain config or ref — `unref`-ed at init. Pass a ref (or computed) so a live
   * page size / margin change reaches `VirtualPageOverlay.updateConfig()`.
   */
  config: PageOverlayConfig | Ref<PageOverlayConfig>
  bufferPages?: number
}

export function useVirtualPages(options: UseVirtualPagesOptions) {
  const data = ref<PageOverlayData>({ totalPages: 1, visiblePages: [], config: { pageSize: { id: 'a4', name: 'A4', pageWidth: 794, pageHeight: 1123 }, margins: { top: 20, bottom: 20, left: 50, right: 50 }, pageGap: 50, headerLeft: '', headerRight: '', footerLeft: '', footerRight: '' } })
  const totalPages = computed(() => data.value.totalPages)
  const visiblePages = computed(() => data.value.visiblePages)
  const isReady = ref(false)

  let overlay: VirtualPageOverlay | null = null
  let resizeObserver: ResizeObserver | null = null
  // Guards async layout results: a re-init while a previous `layout()` is still
  // running must not let the stale result overwrite the new editor's data.
  let generation = 0

  const teardown = () => {
    generation++
    overlay?.disconnect()
    overlay = null
    resizeObserver?.disconnect()
    resizeObserver = null
    isReady.value = false
  }

  const init = async () => {
    const editor = options.editorRef.value
    const scrollEl = options.scrollRef.value
    if (!editor?.view?.dom || !scrollEl) return

    // Rebuild from scratch: the previous editor/scroll container (issue #373).
    teardown()
    const gen = generation
    data.value = { ...data.value, totalPages: 1, visiblePages: [] }

    const nextOverlay = new VirtualPageOverlay(
      editor.view.dom,
      unref(options.config),
      scrollEl,
      options.bufferPages ?? 2,
    )
    overlay = nextOverlay
    // Scroll/visibility changes are pushed, so no polling timer is needed (#376).
    nextOverlay.onVisibleChange = (next) => {
      if (gen === generation) data.value = next
    }
    nextOverlay.observe()

    const initial = await nextOverlay.layout()
    if (gen !== generation) return
    data.value = initial
    isReady.value = true

    // Re-layout on resize to reflect font-size / window changes.
    const observer = new ResizeObserver(async () => {
      if (gen !== generation) return
      const next = await nextOverlay.layout()
      if (gen === generation) data.value = next
    })
    observer.observe(editor.view.dom)
    resizeObserver = observer
  }

  const updateConfig = async (config: Partial<PageOverlayConfig>) => {
    if (overlay) {
      data.value = await overlay.updateConfig(config)
    }
  }

  const refreshData = () => {
    if (overlay) {
      data.value = overlay.getData()
    }
  }

  onUnmounted(() => {
    teardown()
  })

  // Re-init when the editor instance or scroll container changes — including a
  // collaboration room switch, which hands us a new `view.dom` (#373).
  watch(
    [() => options.editorRef.value?.view?.dom ?? null, options.scrollRef],
    ([dom, scrollEl], previous) => {
      const changed = !previous || previous[0] !== dom || previous[1] !== scrollEl
      if (!changed) return
      if (!dom || !scrollEl) {
        teardown()
        return
      }
      void init()
    },
    { immediate: true, flush: 'post' },
  )

  // Re-layout when config changes (plain object or ref, see `UseVirtualPagesOptions`)
  watch(() => unref(options.config), (newConfig) => {
    if (isReady.value) updateConfig(newConfig)
  }, { deep: true })

  return {
    data,
    totalPages,
    visiblePages,
    isReady,
    refreshData,
    updateConfig,
  }
}
