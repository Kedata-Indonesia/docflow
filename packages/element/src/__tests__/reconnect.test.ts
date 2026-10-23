import { afterEach, describe, expect, it, vi } from 'vitest'

// Mount a lightweight stub instead of the full editor: this suite only covers
// the custom element's lifecycle, not the Vue editor itself. The stub renders a
// button so tests can exercise a real `emit('update:modelValue')` through Vue's
// custom-element wrapper, not just a hand-built event.
vi.mock('@kedata-indonesia/docflow-vue', async () => {
  const { h } = await import('vue')
  return {
    DocsEditor: {
      name: 'DocsEditor',
      // Declared so the custom-element wrapper exposes them as element props,
      // which is what `_buildProps()` writes to.
      props: ['modelValue', 'editable', 'theme', 'debug', 'collaboration', 'plugins', 'onImageUpload'],
      emits: ['update:modelValue'],
      setup(
        props: { modelValue?: unknown },
        { emit }: { emit: (event: string, value: unknown) => void },
      ) {
        return () =>
          h(
            'button',
            {
              type: 'button',
              'data-emit-model': '',
              onClick: () =>
                emit('update:modelValue', { marker: 'clicked', modelValue: props.modelValue }),
            },
            'emit',
          )
      },
    },
  }
})

import { DocsEditorElement } from '../index.js'

type EditorProps = HTMLElement & { modelValue?: unknown }

/** The internal Vue element is the only child of the host shadow root. */
function editorInstance(wrapper: HTMLElement): EditorProps {
  const child = wrapper.shadowRoot?.children[0]
  if (!(child instanceof HTMLElement)) throw new Error('editor did not mount')
  return child as EditorProps
}

const initialDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

function tabbedDoc(text: string) {
  return {
    type: 'tabbed-doc',
    activeTabId: 'tab-1',
    tabs: [
      {
        id: 'tab-1',
        label: 'Tab 1',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
      },
    ],
  }
}

/** Simulate the inner Vue wrapper's `emit('update:modelValue', doc)` event. */
function emitModelUpdate(wrapper: HTMLElement, doc: object): void {
  editorInstance(wrapper).dispatchEvent(
    new CustomEvent('update:modelValue', { detail: [doc] }),
  )
}

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
    // The styles live on the Vue element's own shadow root now, so the host
    // shadow holds exactly the internal element.
    expect(shadowRoot?.children).toHaveLength(1)
    expect(editorInstance(element)).toBeInstanceOf(HTMLElement)
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

    expect(element.shadowRoot?.children).toHaveLength(1)
  })

  it('keeps unsaved edits when the editor is moved', () => {
    class UnsavedElement extends DocsEditorElement {}
    customElements.define('docs-editor-unsaved-test', UnsavedElement)

    const element = document.createElement('docs-editor-unsaved-test') as UnsavedElement
    element.setAttribute('content', JSON.stringify(initialDoc))
    document.body.append(element)

    const edited = tabbedDoc('tambahan')
    emitModelUpdate(element, edited)

    element.remove()
    document.body.append(element)

    expect(editorInstance(element).modelValue).toEqual(edited)
  })

  it('lets a host rewrite of content win over cached edits', () => {
    class ContentWinsElement extends DocsEditorElement {}
    customElements.define('docs-editor-content-wins-test', ContentWinsElement)

    const element = document.createElement('docs-editor-content-wins-test') as ContentWinsElement
    element.setAttribute('content', JSON.stringify(initialDoc))
    document.body.append(element)
    emitModelUpdate(element, tabbedDoc('tambahan'))

    const replacement = tabbedDoc('dari host')
    element.setAttribute('content', JSON.stringify(replacement))
    expect(editorInstance(element).modelValue).toEqual(replacement)

    element.remove()
    document.body.append(element)
    expect(editorInstance(element).modelValue).toEqual(replacement)
  })

  it('keeps edits when plugins are replaced after mount', () => {
    class PluginsElement extends DocsEditorElement {}
    customElements.define('docs-editor-plugins-test', PluginsElement)

    const element = document.createElement('docs-editor-plugins-test') as PluginsElement
    element.setAttribute('content', JSON.stringify(initialDoc))
    document.body.append(element)

    const edited = tabbedDoc('tambahan')
    emitModelUpdate(element, edited)
    element.plugins = []

    expect(editorInstance(element).modelValue).toEqual(edited)
  })

  it('lets a rewrite made while detached win over cached edits', () => {
    class DetachedElement extends DocsEditorElement {}
    customElements.define('docs-editor-detached-test', DetachedElement)

    const element = document.createElement('docs-editor-detached-test') as DetachedElement
    element.setAttribute('content', JSON.stringify(initialDoc))
    document.body.append(element)
    emitModelUpdate(element, tabbedDoc('tambahan'))

    const replacement = tabbedDoc('dari host')
    element.remove()
    element.setAttribute('content', JSON.stringify(replacement))
    document.body.append(element)

    expect(editorInstance(element).modelValue).toEqual(replacement)
  })

  it('captures documents emitted through the Vue wrapper', () => {
    class EmitElement extends DocsEditorElement {}
    customElements.define('docs-editor-emit-test', EmitElement)

    const element = document.createElement('docs-editor-emit-test') as EmitElement
    element.setAttribute('content', JSON.stringify(initialDoc))
    document.body.append(element)

    const button = editorInstance(element).shadowRoot?.querySelector('button[data-emit-model]')
    expect(button).not.toBeNull()
    ;(button as HTMLButtonElement).click()

    element.remove()
    document.body.append(element)

    expect(editorInstance(element).modelValue).toEqual({
      marker: 'clicked',
      modelValue: initialDoc,
    })
  })
})
