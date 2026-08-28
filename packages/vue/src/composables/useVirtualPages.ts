import { ref, onMounted, onUnmounted, watch, computed, type Ref } from 'vue'
import { VirtualPageOverlay, type PageOverlayConfig, type PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'

export interface UseVirtualPagesOptions {
  editorRef: Ref<{ view: { dom: HTMLElement } } | null>
  scrollRef: Ref<HTMLElement | null>
  config: PageOverlayConfig
  bufferPages?: number
  enabled?: Ref<boolean>
}

export function useVirtualPages(options: UseVirtualPagesOptions) {
  const data = ref<PageOverlayData>({ totalPages: 1, visiblePages: [], config: { pageSize: { id: 'a4', name: 'A4', pageWidth: 794, pageHeight: 1123 }, margins: { top: 20, bottom: 20, left: 50, right: 50 }, pageGap: 50, headerLeft: '', headerRight: '', footerLeft: '', footerRight: '' } })
  const totalPages = computed(() => data.value.totalPages)
  const visiblePages = computed(() => data.value.visiblePages)
  const isReady = ref(false)

  let overlay: VirtualPageOverlay | null = null
  let resizeObserver: ResizeObserver | null = null

  const isEnabled = () => options.enabled?.value ?? true

  const init = async () => {
    if (!isEnabled()) return
    const editor = options.editorRef.value
    const scrollEl = options.scrollRef.value
    if (!editor?.view?.dom || !scrollEl) return

    overlay = new VirtualPageOverlay(editor.view.dom, options.config, scrollEl, options.bufferPages ?? 2)
    overlay.observe()

    data.value = await overlay.layout()
    isReady.value = true

    // Re-layout on resize to reflect font-size / window changes.
    resizeObserver = new ResizeObserver(async () => {
      if (overlay) {
        data.value = await overlay.layout()
      }
    })
    resizeObserver.observe(editor.view.dom)
  }

  const updateConfig = async (config: Partial<PageOverlayConfig>) => {
    if (overlay && isEnabled()) {
      data.value = await overlay.updateConfig(config)
    }
  }

  const refreshData = () => {
    if (overlay && isEnabled()) {
      data.value = overlay.getData()
    }
  }

  // Poll for visibility updates (scroll events are handled by overlay.observe())
  let pollTimer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    if (isEnabled()) {
      pollTimer = setInterval(refreshData, 250)
    }
  })

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
    overlay?.disconnect()
    resizeObserver?.disconnect()
  })

  // Re-init when editor or scroll container becomes available or enabled state changes
  watch([() => options.editorRef.value?.view?.dom, options.scrollRef, () => options.enabled?.value], () => {
    if (isEnabled() && !isReady.value) {
      init()
    } else if (!isEnabled() && isReady.value) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
      overlay?.disconnect()
      resizeObserver?.disconnect()
      overlay = null
      resizeObserver = null
      isReady.value = false
    }
  }, { immediate: true })

  // Re-layout when config changes
  watch(() => options.config, (newConfig) => {
    if (isReady.value && isEnabled()) updateConfig(newConfig)
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
