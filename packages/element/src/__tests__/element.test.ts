import { describe, expect, it, vi } from 'vitest'
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

  it('releases the collaboration setup on teardown (host-owned room)', () => {
    // The editor no longer destroys host-provided setups — the element owns
    // the room it built, so it must release it here (regression guard for the
    // "remote cursors die until reload" bug in remounting hosts).
    class DocsEditorTeardownElement extends DocsEditorElement {}
    customElements.define('docs-editor-teardown-test', DocsEditorTeardownElement)

    const element = document.createElement('docs-editor-teardown-test') as DocsEditorTeardownElement
    const destroy = vi.fn()
    const internals = element as unknown as {
      _collabSetup?: { destroy: () => void }
      _teardownEditor: () => void
    }
    internals._collabSetup = { destroy }

    internals._teardownEditor()

    expect(destroy).toHaveBeenCalledTimes(1)
    expect(internals._collabSetup).toBeUndefined()
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
