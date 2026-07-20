import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defineCustomElement } from 'vue'
import type { DocsEditorPlugin, ImageUploadHandler } from '@kedata-indonesia/docflow-core'

// At build time, Vite resolves this import and returns the processed CSS as a string.
// This enables Tailwind + ProseMirror styles inside the Shadow DOM.
import shadowStyles from './shadow.css?inline'

const VueDocsEditorElement = defineCustomElement(DocsEditor)

export class DocsEditorElement extends HTMLElement {
  static observedAttributes = ['room', 'theme', 'editable', 'content', 'websocket-url']

  private _vueElement?: HTMLElement
  private _shadowRoot?: ShadowRoot
  private _plugins: DocsEditorPlugin[] = []
  private _onImageUpload?: ImageUploadHandler

  get plugins(): DocsEditorPlugin[] {
    return this._plugins
  }

  set plugins(value: DocsEditorPlugin[]) {
    this._plugins = value
    if (this._vueElement) {
      Object.assign(this._vueElement, this._buildProps())
    }
  }

  /**
   * Host-injected image upload port. Functions can't be HTML attributes, so
   * consumers set it as a JS property: `el.onImageUpload = async (file) => ({ src })`.
   */
  get onImageUpload(): ImageUploadHandler | undefined {
    return this._onImageUpload
  }

  set onImageUpload(value: ImageUploadHandler | undefined) {
    this._onImageUpload = value
    if (this._vueElement) {
      Object.assign(this._vueElement, this._buildProps())
    }
  }

  connectedCallback() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    this._shadowRoot = this.attachShadow({ mode: 'open' })

    // Inject editor styles into the shadow root so Tailwind utilities,
    // ProseMirror overrides, and page layout styles work inside Shadow DOM.
    const styleEl = document.createElement('style')
    styleEl.textContent = shadowStyles
    this._shadowRoot.appendChild(styleEl)

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
      onImageUpload: this._onImageUpload,
    }
  }
}
