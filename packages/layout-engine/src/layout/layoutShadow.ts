/**
 * Off-screen clone used for measurements that need the real layout engine
 * (text ranges for split offsets).
 *
 * The clone is kept off-screen with `visibility: hidden` and the editor's
 * classes so the browser applies the same stylesheet, and margin-top is
 * stripped from the clones so a measured block starts at its own top edge.
 */
export class ShadowLayout {
  private root: HTMLElement | null = null
  private lastHash = ''

  constructor(
    private readonly element: HTMLElement,
    private readonly pageWidth: number,
  ) {}

  /** The element to query for measurements: the clone, or the live editor. */
  get container(): HTMLElement {
    return this.root ?? this.element
  }

  /** Create the clone on first use and refresh it when the document changed. */
  prepare(currentHash: string): void {
    if (!this.root) this.root = this.createRoot()
    if (this.lastHash === currentHash) return

    const root = this.root
    root.innerHTML = ''
    for (const child of Array.from(this.element.children)) {
      root.appendChild(child.cloneNode(true))
    }
    // Clean up margin-top styles from all cloned elements so measurements are clean
    const elements = Array.from(root.getElementsByTagName('*')) as HTMLElement[]
    elements.forEach((el) => {
      el.style.removeProperty('margin-top')
    })
    this.lastHash = currentHash
  }

  dispose(): void {
    if (this.root?.parentNode) this.root.parentNode.removeChild(this.root)
    this.root = null
    this.lastHash = ''
  }

  private createRoot(): HTMLElement {
    const shadow = document.createElement('div')
    shadow.setAttribute('data-layout-shadow', 'true')
    shadow.style.position = 'absolute'
    shadow.style.top = '-9999px'
    shadow.style.left = '-9999px'
    shadow.style.visibility = 'hidden'
    shadow.style.pointerEvents = 'none'
    shadow.style.overflow = 'hidden'
    if (this.pageWidth > 0) shadow.style.width = `${this.pageWidth}px`
    shadow.className = this.element.className || 'tiptap ProseMirror'
    document.body.appendChild(shadow)
    return shadow
  }
}
