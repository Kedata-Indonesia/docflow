import { afterEach, describe, expect, it, vi } from 'vitest'

// Mount a lightweight stub instead of the full editor: this suite only covers
// the custom element's lifecycle, not the Vue editor itself.
vi.mock('@kedata-indonesia/docflow-vue', () => ({
  DocsEditor: {
    name: 'DocsEditor',
    props: ['modelValue'],
    render: () => null,
  },
}))

import { DocsEditorElement } from '../index.js'

describe('DocsEditorElement lifecycle', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('survives disconnect and reconnect without attaching a second shadow root', () => {
    class ReconnectElement extends DocsEditorElement {}
    customElements.define('docs-editor-reconnect-test', ReconnectElement)

    const element = document.createElement('docs-editor-reconnect-test') as ReconnectElement

    document.body.append(element)
    const shadowRoot = element.shadowRoot
    expect(shadowRoot).not.toBeNull()

    element.remove()
    expect(() => document.body.append(element)).not.toThrow()

    expect(element.shadowRoot).toBe(shadowRoot)
    expect(shadowRoot?.querySelector('style')).not.toBeNull()
  })

  it('rebuilds the shadow content once per connect', () => {
    class RebuildElement extends DocsEditorElement {}
    customElements.define('docs-editor-rebuild-test', RebuildElement)

    const element = document.createElement('docs-editor-rebuild-test') as RebuildElement
    document.body.append(element)
    element.remove()
    document.body.append(element)
    element.remove()
    document.body.append(element)

    expect(element.shadowRoot?.children).toHaveLength(2)
  })

  it('preserves unsaved edits across disconnect and reconnect when content attribute does not change', () => {
    class StateElement extends DocsEditorElement {}
    customElements.define('docs-editor-state-test', StateElement)

    const element = document.createElement('docs-editor-state-test') as StateElement
    element.setAttribute('content', 'awal')
    document.body.append(element)

    // Simulate internal Vue component updating modelValue (unsaved edit)
    const vueEl = element.shadowRoot?.querySelector('docflow-docs-editor-internal') as unknown as { modelValue: unknown }
    expect(vueEl).not.toBeNull()
    vueEl.modelValue = 'tambahan'

    // Disconnect (triggers saving last known modelValue)
    element.remove()

    // Reconnect without changing the 'content' attribute
    document.body.append(element)

    const newVueEl = element.shadowRoot?.querySelector('docflow-docs-editor-internal') as unknown as { modelValue: unknown }
    expect(newVueEl.modelValue).toBe('tambahan')
  })

  it('resets to content attribute if content attribute changes before reconnect', () => {
    class AttrChangeElement extends DocsEditorElement {}
    customElements.define('docs-editor-attr-change-test', AttrChangeElement)

    const element = document.createElement('docs-editor-attr-change-test') as AttrChangeElement
    element.setAttribute('content', 'awal')
    document.body.append(element)

    const vueEl = element.shadowRoot?.querySelector('docflow-docs-editor-internal') as unknown as { modelValue: unknown }
    vueEl.modelValue = 'tambahan'

    element.remove()

    // Change content attribute before reconnect
    element.setAttribute('content', 'baru')
    document.body.append(element)

    const newVueEl = element.shadowRoot?.querySelector('docflow-docs-editor-internal') as unknown as { modelValue: unknown }
    expect(newVueEl.modelValue).toBe('baru')
  })
})
