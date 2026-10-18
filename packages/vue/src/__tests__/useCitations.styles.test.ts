import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { BUNDLED_REFERENCE_STYLES, useCitations } from '../composables/useCitations.js'
import type { SidebarKey } from '../types.js'

/**
 * Issue #180: the reference picker must offer the engine's registry — the
 * bundled styles plus whatever the host injected through `CitationPort.styles`
 * — instead of the hardcoded list it used to ship.
 */

interface EngineStub {
  updateSources: () => void
  setStyle: () => void
  getAvailableStyles?: () => { id: string; name: string }[]
}

function setup(engine: EngineStub | null) {
  const activeSidebar = ref<SidebarKey | null>(null)
  // `useCitations` registers a watcher, which needs an owner scope (a component
  // in the app; an effect scope here).
  const scope = effectScope()
  const citations = scope.run(() =>
    useCitations({
      getEditor: () => ({ storage: { citationEngine: { engine } } }) as never,
      getPluginActions: () => ({}) as never,
      getCitation: () => ({ sources: [] }),
      emit: (() => {}) as never,
      t: ((key: string) => key) as never,
      activeSidebar,
    }),
  )!
  return { activeSidebar, citations }
}

describe('useCitations — style list (#180)', () => {
  it('lists the engine registry, so a host-injected style is offered', async () => {
    const { activeSidebar, citations } = setup({
      updateSources: () => {},
      setStyle: () => {},
      getAvailableStyles: () => [
        { id: 'apa', name: 'APA' },
        { id: 'harvard-lite', name: 'Harvard (test)' },
      ],
    })

    activeSidebar.value = 'references'
    await nextTick()

    expect(citations.citationStyles.value.map((s) => s.id)).toEqual(['apa', 'harvard-lite'])
  })

  it('falls back to the bundled four when the engine exposes no registry', () => {
    const { citations } = setup({ updateSources: () => {}, setStyle: () => {} })

    expect(citations.citationStyles.value).toEqual(BUNDLED_REFERENCE_STYLES)
  })

  it('falls back while no editor is mounted', async () => {
    const activeSidebar = ref<SidebarKey | null>(null)
    const citations = useCitations({
      getEditor: () => null,
      getPluginActions: () => ({}) as never,
      getCitation: () => ({ sources: [] }),
      emit: (() => {}) as never,
      t: ((key: string) => key) as never,
      activeSidebar,
    })

    activeSidebar.value = 'references'
    await nextTick()

    expect(citations.citationStyles.value).toEqual(BUNDLED_REFERENCE_STYLES)
  })
})
