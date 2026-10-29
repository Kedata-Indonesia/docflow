import { ref, watch } from 'vue'
import { normalizeZoom } from '@kedata-indonesia/docflow-vue'

const ZOOM_STORAGE_KEY = 'docflow.playground.zoom'

/** Zoom that survives a reload (localStorage is best-effort, see `readZoom`). */
export function usePersistedZoom() {
  const zoom = ref(readZoom())

  watch(zoom, (value) => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(value))
    } catch {
      // Private mode or full storage — the zoom still works for this session.
    }
  })

  return { zoom }
}

function readZoom(): number {
  try {
    return normalizeZoom(Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || 100)
  } catch {
    return 100
  }
}
