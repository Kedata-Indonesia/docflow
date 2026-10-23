import { afterEach, describe, expect, it, vi } from 'vitest'

// Mount a lightweight stub instead of the full editor: this suite only covers
// the custom element's lifecycle, not the Vue editor itself.
vi.mock('@kedata-indonesia/docflow-vue', () => ({
  DocsEditor: { name: 'DocsEditor', render: () => null },
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
})
