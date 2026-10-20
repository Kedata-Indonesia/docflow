import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Issue #144 — the visual zoom surface around the paper.
 *
 * The inner element keeps the document's 100 % layout (so pagination measures
 * unscaled px); it is scaled with `transform`. The outer element reserves the
 * *scaled* box in the scroll container, so scrolling, centring and horizontal
 * overflow keep working at every zoom. Both sizes are measured from the inner
 * layout (ResizeObserver) rather than assumed, because the paper is constrained
 * by the viewport on narrow screens and its height grows with pagination.
 */
export function useZoomSurface(scale: Ref<number>) {
  const surfaceRef = ref<HTMLElement | null>(null)
  const size = ref({ width: 0, height: 0 })
  let observer: ResizeObserver | null = null

  const measure = () => {
    const el = surfaceRef.value
    if (!el) return
    const width = el.offsetWidth
    const height = el.offsetHeight
    if (width !== size.value.width || height !== size.value.height) {
      size.value = { width, height }
    }
  }

  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'undefined' && surfaceRef.value) {
      observer = new ResizeObserver(measure)
      observer.observe(surfaceRef.value)
    }
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  const outerStyle = computed(() => {
    if (!size.value.width || !size.value.height) {
      // Before the first measurement the outer must still span the column so
      // the inner can resolve `w-full` against it (otherwise the inner
      // shrink-wraps to min-content and the ProseMirror is measured at ~200 px).
      return { width: '100%', marginInline: 'auto' }
    }
    const factor = scale.value
    return {
      width: `${size.value.width * factor}px`,
      height: `${size.value.height * factor}px`,
      marginInline: 'auto',
      flexShrink: 0,
    }
  })

  const innerStyle = computed(() => {
    const factor = scale.value
    return {
      width: size.value.width ? `${size.value.width}px` : undefined,
      transform: `scale(${factor})`,
      transformOrigin: 'top left',
      '--docflow-zoom': String(factor),
    }
  })

  return { surfaceRef, size, outerStyle, innerStyle, measure }
}
