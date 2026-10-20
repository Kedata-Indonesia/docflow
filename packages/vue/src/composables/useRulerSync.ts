import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface UseRulerSyncOptions {
  /** The horizontal ruler container (the element the track is positioned in). */
  rulerRef: Ref<HTMLElement | null>
  /** The zoom surface (inner paper wrapper); its rect includes the visual scale. */
  paperRef: Ref<HTMLElement | null>
  /** The scroll container whose horizontal scrolling moves the paper. */
  scrollRef: Ref<HTMLElement | null>
  /** Re-measure when the zoom or the page geometry changes. */
  watchSource: Ref<unknown> | (() => unknown)
}

/**
 * Issue #144 — keep the horizontal ruler's page track over the paper's visual
 * box. The paper may be narrower/wider than the editor (zoom, page size,
 * horizontal scrolling), so the ruler track is measured instead of assumed
 * centred. This also fixes the pre-existing 24 px offset caused by the vertical
 * ruler gutter.
 */
export function useRulerSync(options: UseRulerSyncOptions) {
  const pageLeft = ref<number | null>(null)
  const pageWidth = ref<number | null>(null)
  let frame = 0
  let observer: ResizeObserver | null = null
  let stopWatch: (() => void) | null = null

  const measure = () => {
    const ruler = options.rulerRef.value
    const paper = options.paperRef.value
    if (!ruler || !paper) return
    const rulerRect = ruler.getBoundingClientRect()
    const paperRect = paper.getBoundingClientRect()
    pageLeft.value = paperRect.left - rulerRect.left
    pageWidth.value = paperRect.width
  }

  const schedule = () => {
    if (typeof requestAnimationFrame !== 'function') {
      measure()
      return
    }
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
  }

  onMounted(() => {
    schedule()
    const scroll = options.scrollRef.value
    scroll?.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    if (typeof ResizeObserver !== 'undefined' && options.paperRef.value) {
      observer = new ResizeObserver(schedule)
      observer.observe(options.paperRef.value)
    }
    stopWatch = watch(options.watchSource, schedule, { flush: 'post' })
    // The ref may be attached after this composable runs; measure again next frame.
    schedule()
  })

  onBeforeUnmount(() => {
    if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    options.scrollRef.value?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    observer?.disconnect()
    observer = null
    stopWatch?.()
  })

  return { pageLeft, pageWidth, measure }
}
