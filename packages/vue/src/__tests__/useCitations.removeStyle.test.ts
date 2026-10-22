import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { useCitations } from '../composables/useCitations.js'
import type { SidebarKey } from '../types.js'

/**
 * Issue #361 — an imported style can be deleted again. The picker marks which
 * entries are removable, the engine refuses the bundled four, and removing the
 * active style falls back to the default instead of leaving the document
 * pointing at something that no longer exists.
 */

const HOUSE: CslStyleInfo = {
  id: 'https://contoh.ac.id/styles/house',
  name: 'House style',
  category: 'in-text',
  xml: '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0"><info><title>House style</title><id>https://contoh.ac.id/styles/house</id></info><citation><layout><text variable="title"/></layout></citation></style>',
}

function setup(options: { remove?: boolean } = {}) {
  const activeSidebar = ref<SidebarKey | null>(null)
  const emitted: Array<[string, unknown]> = []
  let registered: CslStyleInfo | null = HOUSE
  let selected = ''

  const engine = {
    updateSources: () => {},
    setStyle: (id: string) => {
      selected = id
    },
    getAvailableStyles: () => [
      { id: 'apa', name: 'APA' },
      ...(registered ? [{ id: registered.id, name: registered.name }] : []),
    ],
    registerStyle: (style: CslStyleInfo) => {
      registered = style
      return style
    },
    ...(options.remove === false
      ? {}
      : {
          removeStyle: (id: string) => {
            if (!registered || registered.id !== id) return false
            registered = null
            return true
          },
        }),
  }

  const scope = effectScope()
  const citations = scope.run(() =>
    useCitations({
      getEditor: () => ({ storage: { citationEngine: { engine } } }) as never,
      getPluginActions: () => ({}) as never,
      getCitation: () => ({ sources: [] }),
      emit: ((event: string, payload: unknown) => emitted.push([event, payload])) as never,
      t: ((key: string) => key) as never,
      activeSidebar,
    }),
  )!

  return { activeSidebar, citations, emitted, scope, getSelected: () => selected }
}

describe('useCitations — style removal (#361)', () => {
  it('marks imported styles removable and the bundled ones not', async () => {
    const { activeSidebar, citations } = setup()

    activeSidebar.value = 'references'
    await nextTick()

    expect(citations.citationStyles.value).toEqual([
      { id: 'apa', name: 'APA', removable: false },
      { id: HOUSE.id, name: HOUSE.name, removable: true },
    ])
  })

  it('removes an inactive style without touching the active one', () => {
    const { citations, emitted, getSelected } = setup()
    citations.handleCitationStyleChange('apa')

    citations.handleStyleRemove(HOUSE.id)

    expect(citations.citationStyles.value.map((s) => s.id)).toEqual(['apa'])
    expect(citations.citationStyleId.value).toBe('apa')
    // No style switch was reported — only the removal.
    expect(emitted.filter(([event]) => event === 'update:citation-style')).toHaveLength(1)
    expect(emitted).toContainEqual(['citation-style-removed', HOUSE.id])
    expect(getSelected()).toBe('apa')
  })

  it('falls back to the default style when the removed one was active', () => {
    const { citations, emitted } = setup()
    citations.handleCitationStyleChange(HOUSE.id)

    citations.handleStyleRemove(HOUSE.id)

    expect(citations.citationStyleId.value).toBe('chicago-notes-bibliography')
    expect(emitted).toContainEqual(['update:citation-style', 'chicago-notes-bibliography'])
    expect(emitted).toContainEqual(['citation-style-removed', HOUSE.id])
    expect(citations.citationStyles.value.map((s) => s.id)).toEqual(['apa'])
  })

  it('does nothing when the engine refuses the removal', () => {
    const { citations, emitted } = setup()

    // Bundled ids are refused by the engine; a stale button must not report a
    // removal that never happened.
    citations.handleStyleRemove('apa')

    expect(emitted).toHaveLength(0)
    expect(citations.citationStyles.value.map((s) => s.id)).toContain('apa')
  })

  it('degrades gracefully when the engine cannot remove styles', async () => {
    const { activeSidebar, citations, emitted } = setup({ remove: false })
    activeSidebar.value = 'references'
    await nextTick()

    citations.handleStyleRemove(HOUSE.id)

    expect(emitted).toHaveLength(0)
    expect(citations.citationStyles.value.map((s) => s.id)).toContain(HOUSE.id)
  })
})
