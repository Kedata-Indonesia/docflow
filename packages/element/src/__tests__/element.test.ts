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

  it('reconnects without re-creating the shadow root', () => {
    // Regression test for #369: the browser keeps the shadow root attached to
    // the host after removal, so a second attachShadow() throws NotSupportedError.
    class DocsEditorReconnectElement extends DocsEditorElement {
      // happy-dom cannot construct the real Vue custom element directly, so mount
      // a stand-in; the reconnect behaviour under test lives in the base class.
      protected override _createEditorElement(): HTMLElement {
        return document.createElement('div')
      }
    }
    customElements.define('docs-editor-reconnect-test', DocsEditorReconnectElement)

    const element = document.createElement(
      'docs-editor-reconnect-test',
    ) as DocsEditorReconnectElement

    document.body.append(element)
    const shadowRoot = element.shadowRoot
    expect(shadowRoot).not.toBeNull()
    expect(shadowRoot?.children).toHaveLength(2)

    element.remove()
    expect(() => document.body.append(element)).not.toThrow()

    expect(element.shadowRoot).toBe(shadowRoot)
    expect(shadowRoot?.querySelector('style')).not.toBeNull()
    expect(shadowRoot?.children).toHaveLength(2)

    element.remove()
  })

  it('mounts the real Vue editor through the internal tag', async () => {
    // Regression test for the wrapper's mount path: constructing the Vue custom
    // element with `new` throws "Illegal constructor" because it is unregistered.
    class DocsEditorRealElement extends DocsEditorElement {}
    customElements.define('docs-editor-real-test', DocsEditorRealElement)

    const element = document.createElement('docs-editor-real-test') as DocsEditorRealElement
    document.body.append(element)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(element.shadowRoot?.querySelector('docflow-editor-inner')).not.toBeNull()

    element.remove()
    document.body.append(element)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(element.shadowRoot?.querySelector('docflow-editor-inner')).not.toBeNull()
    element.remove()
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
