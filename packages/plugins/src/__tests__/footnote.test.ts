import { describe, expect, it } from 'vitest'
import { footnotePlugin } from '../footnote.js'

describe('footnotePlugin localization metadata', () => {
  it('exposes a locale key for the toolbar Insert item', () => {
    const item = footnotePlugin.toolbar?.find((entry) => entry.action === 'insertFootnote')
    expect(item).toMatchObject({
      label: 'Footnote',
      labelKey: 'header.footnote',
    })
  })

  it('exposes a locale key for the slash command', () => {
    expect(footnotePlugin.slashCommands?.[0]).toMatchObject({
      name: 'Footnote',
      nameKey: 'header.footnote',
      command: 'insertFootnote',
    })
  })
})
