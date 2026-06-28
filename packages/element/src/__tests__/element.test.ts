import { describe, expect, it } from 'vitest'
import { DocsEditorElement, registerDocsEditor } from '../index.js'
import type { DocsEditorPlugin } from '@docs-editor/core'

describe('DocsEditorElement', () => {
  it('exports a custom element class extending HTMLElement', () => {
    expect(DocsEditorElement).toBeDefined()
    expect(typeof DocsEditorElement).toBe('function')
    expect(Object.prototype.isPrototypeOf.call(HTMLElement, DocsEditorElement)).toBe(true)
  })

  it('observes required attributes', () => {
    expect(DocsEditorElement.observedAttributes).toEqual(
      expect.arrayContaining(['room', 'theme', 'editable', 'content', 'websocket-url']),
    )
  })

  it('registerDocsEditor defines the element in a mock registry', () => {
    const registry = createMockRegistry()
    registerDocsEditor('docs-editor', registry)
    expect(registry.get('docs-editor')).toBe(DocsEditorElement)
  })

  it('does not redefine an existing tag in a mock registry', () => {
    const registry = createMockRegistry()
    const otherClass = class extends HTMLElement {}
    registry.define('docs-editor', otherClass)
    registerDocsEditor('docs-editor', registry)
    expect(registry.get('docs-editor')).toBe(otherClass)
  })

  it('forwards plugins to the Vue component props', () => {
    const element = new DocsEditorElement()
    const plugins: DocsEditorPlugin[] = [{ id: 'demo' }]
    element.plugins = plugins
    const props = (element as unknown as { _buildProps: () => Record<string, unknown> })._buildProps()
    expect(props.plugins).toBe(plugins)
  })
})

function createMockRegistry(): CustomElementRegistry {
  const map = new Map<string, CustomElementConstructor>()
  return {
    get: (name: string) => map.get(name),
    define: (name: string, ctor: CustomElementConstructor) => {
      if (!map.has(name)) {
        map.set(name, ctor)
      }
    },
    upgrade: () => {},
    whenDefined: (name: string) => Promise.resolve(map.get(name) as CustomElementConstructor),
  } as unknown as CustomElementRegistry
}
