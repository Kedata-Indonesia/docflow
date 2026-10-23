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
  private _lastContentAttr: string | null = null
  private _lastModelValue?: unknown

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
    this._vueElement = vueElement
    shadowRoot.appendChild(vueElement)
  }

  disconnectedCallback() {
    if (this._vueElement && 'modelValue' in this._vueElement) {
      this._lastModelValue = (this._vueElement as unknown as { modelValue: unknown }).modelValue
    }
    this._vueElement?.remove()
    this._vueElement = undefined
  }

  private _ensureShadowRoot(): ShadowRoot {
    this._shadowRoot ??= this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    return this._shadowRoot
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
    
    if (contentAttr !== this._lastContentAttr) {
      this._lastContentAttr = contentAttr
      this._lastModelValue = undefined
    }

    if (this._lastModelValue !== undefined) {
      modelValue = this._lastModelValue as object | string
    } else if (contentAttr !== null) {
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
