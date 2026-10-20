import { describe, expect, it } from 'vitest'
import { buildMenus, type MenuStructureContext } from '../components/menuStructure.js'

function context(hasCitationPlugin: boolean): MenuStructureContext {
  return {
    t: (key) => key,
    isMac: false,
    outlineOpen: false,
    focusMode: false,
    showRuler: false,
    mode: 'editing',
    pageless: false,
    supportedLocales: ['en', 'id'],
    getLocaleName: (locale) => locale,
    hasCitationPlugin,
  }
}

describe('Insert ▸ Bibliography', () => {
  it('sits directly below Footnote when the citation plugin is loaded', () => {
    const items = buildMenus(context(true)).Insert.items

    const footnoteIndex = items.findIndex((item) => item.action === 'insert-footnote')
    expect(footnoteIndex).toBeGreaterThanOrEqual(0)
    expect(items[footnoteIndex + 1]).toMatchObject({
      label: 'header.bibliography',
      action: 'insert-bibliography',
    })
  })

  it('is hidden when the citation plugin is not loaded', () => {
    const items = buildMenus(context(false)).Insert.items

    expect(items.some((item) => item.action === 'insert-bibliography')).toBe(false)
  })
})
