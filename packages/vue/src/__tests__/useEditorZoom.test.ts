import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_PRESETS,
  normalizeZoom,
  useEditorZoom,
} from '../composables/useEditorZoom.js'

function setup(initial: number | undefined) {
  const zoomProp = ref(initial)
  const virtual = ref(false)
  const emit = vi.fn()
  const scope = effectScope()
  const api = scope.run(() =>
    useEditorZoom({
      getZoom: () => zoomProp.value,
      isVirtual: () => virtual.value,
      emit,
    }),
  )!
  return { api, zoomProp, virtual, emit, scope }
}

describe('useEditorZoom (#144)', () => {
  it('exposes the documented presets', () => {
    expect(ZOOM_PRESETS).toEqual([50, 75, 100, 125, 150, 200])
    expect(DEFAULT_ZOOM).toBe(100)
    expect(MIN_ZOOM).toBe(50)
    expect(MAX_ZOOM).toBe(200)
  })

  it('clamps and rounds arbitrary values', () => {
    expect(normalizeZoom(undefined)).toBe(100)
    expect(normalizeZoom(Number.NaN)).toBe(100)
    expect(normalizeZoom(10)).toBe(50)
    expect(normalizeZoom(500)).toBe(200)
    expect(normalizeZoom(149.6)).toBe(150)
    expect(normalizeZoom(125)).toBe(125)
  })

  it('tracks the controlled prop and emits on change', async () => {
    const { api, zoomProp, emit, scope } = setup(100)
    expect(api.zoom.value).toBe(100)

    api.setZoom(150)
    expect(api.zoom.value).toBe(150)
    expect(api.scale.value).toBe(1.5)
    expect(emit).toHaveBeenLastCalledWith(150)

    api.setZoom(150)
    expect(emit).toHaveBeenCalledTimes(1)

    zoomProp.value = 75
    await nextTick()
    expect(api.zoom.value).toBe(75)
    scope.stop()
  })

  it('pins the zoom to 100 % while virtual pages are on', async () => {
    const { api, virtual, emit, scope } = setup(150)
    expect(api.disabled.value).toBe(false)
    expect(api.zoom.value).toBe(150)

    virtual.value = true
    await nextTick()
    expect(api.disabled.value).toBe(true)
    expect(api.zoom.value).toBe(100)
    expect(emit).toHaveBeenLastCalledWith(100)

    api.setZoom(200)
    expect(api.zoom.value).toBe(100)
    scope.stop()
  })
})
