import { ref, watch } from 'vue'
import { normalizeZoom } from '@kedata-indonesia/docflow-vue'

const ZOOM_STORAGE_KEY = 'docflow.playground.zoom'

/** Read the last zoom from storage, falling back to 100% in private mode. */
function loadZoom(): number {
  try {
    return normalizeZoom(Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || 100)
  } catch {
    return 100
  }
}

/**
 * Zoom that survives reloads. The playground persists it exactly the way a host
 * would; the library only owns the value passed through the `zoom` prop.
 */
export function usePersistedZoom() {
  const zoom = ref(loadZoom())

  watch(zoom, (value) => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(value))
    } catch {
      // Private mode / storage full — zoom still works for this session.
    }
  })

  return { zoom }
}
