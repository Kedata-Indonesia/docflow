import { DocsEditor } from '@docs-editor/vue'
import { defineCustomElement } from 'vue'
import type { DocsEditorPlugin } from '@docs-editor/core'

const VueDocsEditorElement = defineCustomElement(DocsEditor)

export class DocsEditorElement extends HTMLElement {
  static observedAttributes = ['room', 'theme', 'editable', 'content', 'websocket-url']

  private _vueElement?: HTMLElement
  private _shadowRoot?: ShadowRoot
  private _plugins: DocsEditorPlugin[] = []

  get plugins(): DocsEditorPlugin[] {
    return this._plugins
  }

  set plugins(value: DocsEditorPlugin[]) {
    this._plugins = value
    if (this._vueElement) {
      Object.assign(this._vueElement, this._buildProps())
    }
  }

  connectedCallback() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    this._shadowRoot = this.attachShadow({ mode: 'open' })
    const props = this._buildProps()
    this._vueElement = new VueDocsEditorElement(props)
    this._shadowRoot.appendChild(this._vueElement)
  }

  disconnectedCallback() {
    this._vueElement?.remove()
    this._vueElement = undefined
    this._shadowRoot = undefined
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue || !this._vueElement) return
    Object.assign(this._vueElement, this._buildProps())
  }

  private _buildProps(): Record<string, unknown> {
    const editableAttr = this.getAttribute('editable')
    const editable = editableAttr === null ? true : editableAttr !== 'false'

    let modelValue: object | string | undefined
    const contentAttr = this.getAttribute('content')
    if (contentAttr !== null) {
      try {
        modelValue = JSON.parse(contentAttr)
      } catch {
        modelValue = contentAttr
      }
    }

    const room = this.getAttribute('room')
    const websocketUrl = this.getAttribute('websocket-url')
    let collaboration: Record<string, unknown> | undefined
    if (room) {
      collaboration = {
        room,
        user: { name: 'Anonymous', color: '#3b82f6' },
      }
      if (websocketUrl) {
        collaboration.provider = 'websocket'
        collaboration.websocketUrl = websocketUrl
      }
    }

    return {
      modelValue,
      editable,
      collaboration,
      plugins: this._plugins,
    }
  }
}
