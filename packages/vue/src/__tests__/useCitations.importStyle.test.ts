import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import type { CslStyleInfo } from '@kedata-indonesia/docflow-core'
import { useCitations } from '../composables/useCitations.js'
import type { SidebarKey } from '../types.js'

/**
 * Issue #251 — importing a `.csl` file is a library capability: parse the XML,
 * register it on the engine, refresh the picker, select it, and tell the host
 * so it can persist the style.
 */

const VALID_CSL = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">',
  '  <info><title>Imported Test</title><id>imported-test</id></info>',
  '  <citation><layout prefix="T(" suffix=")"><text variable="title"/></layout></citation>',
  '  <bibliography><layout><text variable="title"/></layout></bibliography>',
  '</style>',
].join('\n')

function setup(options: { register?: boolean } = {}) {
  const activeSidebar = ref<SidebarKey | null>(null)
  const emitted: Array<[string, unknown]> = []
  let registered: CslStyleInfo | null = null
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
    ...(options.register === false
      ? {}
      : {
          registerStyle: (style: CslStyleInfo) => {
            registered = style
            return style
          },
        }),
  }

  // `useCitations` registers a watcher, which needs an owner scope.
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

  return { citations, emitted, scope, getRegistered: () => registered, getSelected: () => selected }
}

describe('useCitations — CSL style import (#251)', () => {
  it('registers, selects, and announces an imported .csl style', () => {
    const { citations, emitted, getRegistered, getSelected } = setup()

    citations.handleStyleImport({ text: VALID_CSL, filename: 'imported-test.csl' })

    expect(getRegistered()).toMatchObject({
      id: 'imported-test',
      name: 'Imported Test',
      category: 'in-text',
    })
    expect(getSelected()).toBe('imported-test')
    expect(citations.citationStyleId.value).toBe('imported-test')
    expect(citations.citationStyles.value.map((s) => s.id)).toContain('imported-test')
    expect(emitted).toContainEqual(['update:citation-style', 'imported-test'])
    expect(emitted).toContainEqual([
      'citation-style-imported',
      expect.objectContaining({ id: 'imported-test', name: 'Imported Test' }),
    ])
    expect(citations.styleImportMessage.value).toBe('sidebars.references.styleImport.success')
  })

  it('reports .bst and .ens as unsupported instead of registering them', () => {
    for (const filename of ['style.bst', 'style.ens', 'STYLE.BST']) {
      const { citations, getRegistered } = setup()

      citations.handleStyleImport({ text: VALID_CSL, filename })

      expect(getRegistered()).toBeNull()
      expect(citations.styleImportMessage.value).toBe('sidebars.references.styleImport.unsupported')
    }
  })

  it('reports invalid XML without touching the active style', () => {
    const { citations, emitted, getRegistered, getSelected } = setup()

    citations.handleStyleImport({ text: '<style id="broken">', filename: 'broken.csl' })

    expect(getRegistered()).toBeNull()
    expect(getSelected()).toBe('')
    expect(citations.citationStyleId.value).toBe('chicago-notes-bibliography')
    expect(citations.styleImportMessage.value).toBe('sidebars.references.styleImport.invalid')
    expect(emitted).toHaveLength(0)
  })

  it('degrades gracefully when the engine has no runtime registration', () => {
    const { citations, getRegistered } = setup({ register: false })

    citations.handleStyleImport({ text: VALID_CSL, filename: 'imported-test.csl' })

    expect(getRegistered()).toBeNull()
    expect(citations.styleImportMessage.value).toBe('sidebars.references.styleImport.unavailable')
  })
})
