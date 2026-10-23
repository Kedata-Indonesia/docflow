import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defineCustomElement } from 'vue'
import type { DocsEditorPlugin, ImageUploadHandler } from '@kedata-indonesia/docflow-core'

// At build time, Vite resolves this import and returns the processed CSS as a string.
// This enables Tailwind + ProseMirror styles inside the Shadow DOM.
import shadowStyles from './shadow.css?inline'

// The Vue wrapper is a real custom element: it must be registered before it can
// be constructed. `new VueCustomElement()` throws "Illegal constructor" in every
// browser (and in happy-dom), so the wrapper is mounted through an internal tag.
const INNER_TAG = 'docflow-editor-inner'
const VueDocsEditorElement = defineCustomElement(DocsEditor)

function ensureInnerElementDefined() {
  if (typeof customElements !== 'undefined' && !customElements.get(INNER_TAG)) {
    customElements.define(INNER_TAG, VueDocsEditorElement)
  }
}

export class DocsEditorElement extends HTMLElement {
  static observedAttributes = ['room', 'theme', 'editable', 'content', 'websocket-url', 'debug']

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

    // Reuse the shadow root across reconnects. The browser keeps the shadow root
    // attached to the host after it is removed from the document, and calling
    // attachShadow() a second time throws NotSupportedError — which leaves a
    // blank, unhydrated element for hosts that move or re-parent it.
    this._shadowRoot ??= this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    this._shadowRoot.replaceChildren()

    // Inject editor styles into the shadow root so Tailwind utilities,
    // ProseMirror overrides, and page layout styles work inside Shadow DOM.
    const styleEl = document.createElement('style')
    styleEl.textContent = shadowStyles
    this._shadowRoot.appendChild(styleEl)

    const props = this._buildProps()
    const vueElement = this._createEditorElement(props)
    this._vueElement = vueElement
    this._shadowRoot.appendChild(vueElement)
  }

  /** Test seam: subclasses can mount a stand-in instead of the real Vue element. */
  protected _createEditorElement(props: Record<string, unknown>): HTMLElement {
    ensureInnerElementDefined()
    const element = document.createElement(INNER_TAG)
    Object.assign(element, props)
    return element
  }

  disconnectedCallback() {
    this._vueElement?.remove()
    this._vueElement = undefined
    // Keep _shadowRoot: it stays attached to the host, so it is reused on reconnect.
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
      debug,
      collaboration,
      plugins: this._plugins,
      onImageUpload: this._onImageUpload,
    }
  }
}
