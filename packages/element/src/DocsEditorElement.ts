import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defineCustomElement } from 'vue'
import type { DocsEditorPlugin, ImageUploadHandler } from '@kedata-indonesia/docflow-core'

// At build time, Vite resolves this import and returns the processed CSS as a string.
// This enables Tailwind + ProseMirror styles inside the Shadow DOM.
import shadowStyles from './shadow.css?inline'

const VueDocsEditorElement = defineCustomElement(DocsEditor)

let vueElementTag: string | undefined

/**
 * A custom element constructor can only be instantiated after it has been
 * registered. Keep the internal tag private and pick a free name so multiple
 * copies of this package can coexist on one page.
 */
function registerVueElement(): void {
  if (vueElementTag) return

  let suffix = 0
  let tag = 'docflow-docs-editor-internal'
  while (customElements.get(tag)) {
    tag = `docflow-docs-editor-internal-${++suffix}`
  }

  customElements.define(tag, VueDocsEditorElement)
  vueElementTag = tag
}

export class DocsEditorElement extends HTMLElement {
  static observedAttributes = ['room', 'theme', 'editable', 'content', 'websocket-url', 'debug']

  private _vueElement?: HTMLElement
  private _shadowRoot?: ShadowRoot
  private _plugins: DocsEditorPlugin[] = []
  private _onImageUpload?: ImageUploadHandler
  /**
   * Last document the editor emitted, kept alive across a disconnect so moving
   * the element does not discard unsaved edits (issue #392).
   */
  private _modelValue?: object | string
  /** `content` attribute that produced `_modelValue`; a host rewrite wins. */
  private _contentAttr?: string | null

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

    // The browser keeps the shadow root on the host after a disconnect, so
    // reuse it instead of attaching a second one (which throws NotSupportedError).
    const shadowRoot = this._ensureShadowRoot()
    shadowRoot.replaceChildren()

    // Inject editor styles into the shadow root so Tailwind utilities,
    // ProseMirror overrides, and page layout styles work inside Shadow DOM.
    const styleEl = document.createElement('style')
    styleEl.textContent = shadowStyles
    shadowRoot.appendChild(styleEl)

    const props = this._buildProps()
    registerVueElement()
    const vueElement = new VueDocsEditorElement(props)
    vueElement.addEventListener('update:modelValue', this._onModelUpdate)
    this._vueElement = vueElement
    shadowRoot.appendChild(vueElement)
  }

  disconnectedCallback() {
    this._vueElement?.removeEventListener('update:modelValue', this._onModelUpdate)
    this._vueElement?.remove()
    this._vueElement = undefined
  }

  private _ensureShadowRoot(): ShadowRoot {
    this._shadowRoot ??= this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    return this._shadowRoot
  }

  /**
   * Vue's custom-element wrapper dispatches emit arguments as an array in
   * `detail`, so `update:modelValue` carries the document at index 0.
   */
  private _onModelUpdate = (event: Event): void => {
    const { detail } = event as CustomEvent<unknown>
    // Vue passes emit arguments as an array; tolerate a bare payload too, in
    // case a future version drops the wrapper.
    const value = Array.isArray(detail) ? detail[0] : detail
    if (typeof value === 'string' || (typeof value === 'object' && value !== null)) {
      this._modelValue = value
    }
  }

  /**
   * Reuse the editor's latest document while the host has not rewritten the
   * `content` attribute; a rewrite (including while disconnected) is parsed
   * fresh and becomes the new baseline.
   */
  private _currentModelValue(): object | string | undefined {
    const contentAttr = this.getAttribute('content')
    if (contentAttr !== this._contentAttr) {
      this._contentAttr = contentAttr
      this._modelValue = this._parseContent(contentAttr)
    }
    return this._modelValue
  }

  private _parseContent(contentAttr: string | null): object | string | undefined {
    if (contentAttr === null) return undefined
    try {
      return JSON.parse(contentAttr) as object
    } catch {
      return contentAttr
    }
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue || !this._vueElement) return
    Object.assign(this._vueElement, this._buildProps())
  }

  private _buildProps(): Record<string, unknown> {
    const editableAttr = this.getAttribute('editable')
    const editable = editableAttr === null ? true : editableAttr !== 'false'

    // Boolean attribute semantics: `<docs-editor debug>` or `debug="true"` enables
    // the performance overlay; `debug="false"` disables it.
    const debugAttr = this.getAttribute('debug')
    const debug = debugAttr === null ? false : debugAttr !== 'false'

    const modelValue = this._currentModelValue()

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
      debug,
      collaboration,
      plugins: this._plugins,
      onImageUpload: this._onImageUpload,
    }
  }
}
