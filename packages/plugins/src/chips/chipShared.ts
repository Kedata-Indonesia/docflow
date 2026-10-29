import type { NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

// ─── attribute helpers ────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(iso: string): string {
  if (!iso) return 'Pick a date'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return 'Pick a date'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function initialOf(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?'
}

export const DEFAULT_STATUSES = ['To Do', 'In Progress', 'Review', 'Approved']

export function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ─── shared node-view plumbing ────────────────────────────────────────────

/** The chip shell every kind shares: pill class, node-type marker, non-editable. */
export function createChipDom(modifier: string, nodeType: string): HTMLElement {
  const dom = document.createElement('span')
  dom.className = `docs-chip docs-chip--${modifier}`
  dom.setAttribute('data-node-type', nodeType)
  dom.setAttribute('contenteditable', 'false')
  return dom
}

/**
 * v3: `getPos` is optional on a node view's props (a view can be created
 * without a position); calling it unconditionally throws.
 */
export function resolvePos(props: { getPos?: () => number | undefined }): number | undefined {
  return typeof props.getPos === 'function' ? props.getPos() : undefined
}

/** Icon + label pair used by the file/location chips. */
export function renderIconLabel(dom: HTMLElement, icon: string, label: string): void {
  dom.replaceChildren()
  const iconEl = document.createElement('span')
  iconEl.className = 'docs-chip-icon'
  iconEl.textContent = icon
  const labelEl = document.createElement('span')
  labelEl.className = 'docs-chip-label'
  labelEl.textContent = label
  dom.replaceChildren(iconEl, labelEl)
}

/**
 * Node view for the read-only chips: one DOM node per chip instance,
 * re-rendered in place when the document updates. `update` returns `false` for
 * a different node type so ProseMirror recreates the view instead of reusing it.
 */
export function simpleChipView(
  typeName: string,
  createDom: () => HTMLElement,
  render: (dom: HTMLElement, node: PMNode) => void,
): NodeViewRenderer {
  return (props) => {
    const dom = createDom()
    render(dom, props.node)
    return {
      dom,
      update(updatedNode: PMNode): boolean {
        if (updatedNode.type.name !== typeName) return false
        render(dom, updatedNode)
        return true
      },
    }
  }
}
