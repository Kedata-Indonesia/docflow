import { describe, expect, it } from 'vitest'
import { DocsEditorElement, registerDocsEditor } from '../index.js'
import type { DocsEditorPlugin } from '@kedata-indonesia/docflow-core'

describe('DocsEditorElement', () => {
  it('exports a custom element class extending HTMLElement', () => {
    expect(DocsEditorElement).toBeDefined()
    expect(typeof DocsEditorElement).toBe('function')
    expect(Object.prototype.isPrototypeOf.call(HTMLElement, DocsEditorElement)).toBe(true)
  })

  it('observes required attributes', () => {
    expect(DocsEditorElement.observedAttributes).toEqual(
      expect.arrayContaining(['room', 'theme', 'editable', 'content', 'websocket-url', 'debug']),
    )
  })

  it('parses the debug attribute as a boolean into props', () => {
    // A custom element constructor can only be registered once per registry,
    // so use a fresh subclass for this test tag.
    class DocsEditorDebugElement extends DocsEditorElement {}
    customElements.define('docs-editor-debug-test', DocsEditorDebugElement)

    const buildProps = (el: DocsEditorDebugElement) =>
      (el as unknown as { _buildProps: () => Record<string, unknown> })._buildProps()

    // Present (boolean semantics) → true
    const enabled = document.createElement('docs-editor-debug-test') as DocsEditorDebugElement
    enabled.setAttribute('debug', '')
    expect(buildProps(enabled).debug).toBe(true)

    // Explicit "true" → true
    const explicit = document.createElement('docs-editor-debug-test') as DocsEditorDebugElement
    explicit.setAttribute('debug', 'true')
    expect(buildProps(explicit).debug).toBe(true)

    // "false" or missing → false
    const disabled = document.createElement('docs-editor-debug-test') as DocsEditorDebugElement
    disabled.setAttribute('debug', 'false')
    expect(buildProps(disabled).debug).toBe(false)

    const missing = document.createElement('docs-editor-debug-test') as DocsEditorDebugElement
    expect(buildProps(missing).debug).toBe(false)
  })

  it('forwards a valid theme attribute and ignores anything else (#375)', () => {
    class DocsEditorThemeElement extends DocsEditorElement {}
    customElements.define('docs-editor-theme-test', DocsEditorThemeElement)

    const buildProps = (el: DocsEditorThemeElement) =>
      (el as unknown as { _buildProps: () => Record<string, unknown> })._buildProps()

    const dark = document.createElement('docs-editor-theme-test') as DocsEditorThemeElement
    dark.setAttribute('theme', 'dark')
    expect(buildProps(dark).theme).toBe('dark')

    const light = document.createElement('docs-editor-theme-test') as DocsEditorThemeElement
    light.setAttribute('theme', 'light')
    expect(buildProps(light).theme).toBe('light')

    const invalid = document.createElement('docs-editor-theme-test') as DocsEditorThemeElement
    invalid.setAttribute('theme', 'blue')
    expect(buildProps(invalid).theme).toBeUndefined()

    const missing = document.createElement('docs-editor-theme-test') as DocsEditorThemeElement
    expect(buildProps(missing).theme).toBeUndefined()
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
    const tagName = 'docs-editor-test'
    customElements.define(tagName, DocsEditorElement)
    const element = document.createElement(tagName) as DocsEditorElement
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
