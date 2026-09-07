import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defineCustomElement } from 'vue'
import {
  createCollaboration,
  type CollaborationSetup,
  type DocsEditorPlugin,
  type ImageUploadHandler,
} from '@kedata-indonesia/docflow-core'

// At build time, Vite resolves this import and returns the processed CSS as a string.
// This enables Tailwind + ProseMirror styles inside the Shadow DOM.
import shadowStyles from './shadow.css?inline'

const VueDocsEditorElement = defineCustomElement(DocsEditor)

export class DocsEditorElement extends HTMLElement {
  static observedAttributes = ['room', 'theme', 'editable', 'content', 'websocket-url', 'debug']

  private _vueElement?: HTMLElement
  private _shadowRoot?: ShadowRoot
  private _plugins: DocsEditorPlugin[] = []
  private _onImageUpload?: ImageUploadHandler
  /**
   * Prebuilt collaboration setup (issue fe-aktifai#230). Providers are built
   * asynchronously via `createCollaboration()` — which lazy-imports
   * y-webrtc/y-websocket — so the element resolves the setup first and only
   * then mounts the inner editor with it (a mounted editor cannot be rewired
   * to another room; swapping rooms means a full remount).
   */
  private _collabSetup?: CollaborationSetup
  /** Monotonic token invalidating in-flight async collaboration builds. */
  private _collabRequest = 0
  private _connected = false

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
    if (this._connected) return
    this._connected = true

    // A custom element keeps its shadow root across remove/re-insert; only
    // create (and style) it once.
    if (!this._shadowRoot) {
      this._shadowRoot = this.attachShadow({ mode: 'open' })

      // Inject editor styles into the shadow root so Tailwind utilities,
      // ProseMirror overrides, and page layout styles work inside Shadow DOM.
      const styleEl = document.createElement('style')
      styleEl.textContent = shadowStyles
      this._shadowRoot.appendChild(styleEl)
    }

    void this._mount()
  }

  disconnectedCallback() {
    this._connected = false
    this._collabRequest += 1
    this._teardownEditor()
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue || !this._connected) return

    if (name === 'room' || name === 'websocket-url') {
      // Collaboration room/transport changed → tear down the current editor
      // and remount it against a freshly built setup.
      void this._mount()
      return
    }

    if (this._vueElement) {
      Object.assign(this._vueElement, this._buildProps())
    }
  }

  /**
   * (Re)build the inner editor. When a collaboration `room` is configured the
   * setup is resolved first (async — `createCollaboration` lazy-imports the
   * network sync provider), so the editor's first mount is already
   * collab-ready. Failures (e.g. an unreachable provider URL) degrade to a
   * local-only editor instead of leaving a blank host.
   */
  private async _mount(): Promise<void> {
    const request = ++this._collabRequest
    this._teardownEditor()

    const room = this.getAttribute('room')
    const props = this._buildProps()

    if (room) {
      const websocketUrl = this.getAttribute('websocket-url')
      try {
        const setup = await createCollaboration(
          websocketUrl
            ? { room, provider: 'websocket', websocketUrl, user: { name: 'Anonymous', color: '#3b82f6' } }
            : { room, user: { name: 'Anonymous', color: '#3b82f6' } },
        )
        // The element was disconnected or the room changed while we were
        // resolving — drop this setup, a newer one is on its way.
        if (request !== this._collabRequest || !this._connected) {
          setup.destroy()
          return
        }
        this._collabSetup = setup
        props.collaboration = setup
      } catch (err) {
        console.warn('[DocsEditorElement] collaboration setup failed, falling back to local editor', err)
      }
    }

    if (!this._connected || !this._shadowRoot) return

    this._vueElement = new VueDocsEditorElement(props)
    this._shadowRoot.appendChild(this._vueElement)
  }

  /**
   * Unmount the inner Vue editor and release its collaboration setup.
   *
   * Ownership: a setup handed to a mounted editor is destroyed exactly once
   * by the editor itself (`createEditor().destroy()` → `setup.destroy()`).
   * Only setups that were resolved but never reached an editor (element
   * disconnected / room changed mid-resolution) are destroyed here.
   */
  private _teardownEditor(): void {
    const setupHandedToEditor = this._vueElement !== undefined
    this._vueElement?.remove()
    this._vueElement = undefined
    const setup = this._collabSetup
    this._collabSetup = undefined
    if (setup && !setupHandedToEditor) {
      setup.destroy()
    }
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

    return {
      modelValue,
      editable,
      debug,
      plugins: this._plugins,
      onImageUpload: this._onImageUpload,
    }
  }
}
