import { computed, ref, watch } from 'vue'

/** Issue #144 — zoom presets offered by the toolbar (percent). */
export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200] as const
export const MIN_ZOOM = 50
export const MAX_ZOOM = 200
export const DEFAULT_ZOOM = 100

/** Clamp/round an arbitrary zoom value to a usable percentage. */
export function normalizeZoom(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)))
}

export interface UseEditorZoomOptions {
  /** Read the controlled `zoom` prop lazily so prop changes stay reactive. */
  getZoom: () => number | undefined
  /**
   * Virtual pages (experimental) mix scroll/layout measurements and are not
   * zoom-aware; the control is disabled and the value pinned to 100 while on.
   */
  isVirtual: () => boolean
  emit: (zoom: number) => void
}

/**
 * Issue #144 — the page-surface zoom. The zoom is a visual scale (the paper's
 * layout stays at 100 %); the pagination patch normalizes the rect values it
 * reads, so page breaks remain correct at every preset.
 */
export function useEditorZoom(options: UseEditorZoomOptions) {
  const zoom = ref(normalizeZoom(options.getZoom()))
  const scale = computed(() => zoom.value / 100)
  const disabled = computed(() => options.isVirtual())

  watch(
    () => options.getZoom(),
    (next) => {
      zoom.value = normalizeZoom(next)
    },
  )

  watch(
    () => options.isVirtual(),
    (virtual) => {
      if (virtual && zoom.value !== DEFAULT_ZOOM) {
        zoom.value = DEFAULT_ZOOM
        options.emit(DEFAULT_ZOOM)
      }
    },
  )

  const setZoom = (next: number) => {
    if (disabled.value) return
    const clamped = normalizeZoom(next)
    if (clamped === zoom.value) return
    zoom.value = clamped
    options.emit(clamped)
  }

  return { zoom, scale, disabled, presets: ZOOM_PRESETS, setZoom }
}
