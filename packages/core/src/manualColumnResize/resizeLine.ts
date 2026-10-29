import type { EditorView } from '@tiptap/pm/view'

/**
 * The cyan "border you are about to drag" indicator.
 *
 * One element is created on first use and reused for the whole editor
 * lifetime: `position: fixed` so it is not clipped by the paper's overflow,
 * `pointer-events: none` so it never steals the drag, plus the `col-resize`
 * cursor on both the body and the editor DOM.
 */

const LINE_COLOR = '#06b6d4'

export interface ResizeLine {
  show: (table: HTMLElement, borderX: number) => void
  hide: () => void
  destroy: () => void
}

function createDot(vertical: 'top' | 'bottom'): HTMLElement {
  const dot = document.createElement('div')
  Object.assign(dot.style, {
    position: 'absolute',
    [vertical]: '-4px',
    left: '-3.5px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#ffffff',
    border: `2px solid ${LINE_COLOR}`,
  })
  return dot
}

export function createResizeLine(view: EditorView): ResizeLine {
  let lineEl: HTMLElement | null = null

  function getOrCreateLine(): HTMLElement {
    if (!lineEl) {
      lineEl = document.createElement('div')
      lineEl.className = 'docflow-active-border-line'
      Object.assign(lineEl.style, {
        position: 'fixed',
        width: '3px',
        background: LINE_COLOR,
        boxShadow: `0 0 8px rgba(6, 182, 212, 0.9)`,
        pointerEvents: 'none',
        zIndex: '999999',
        display: 'none',
        borderRadius: '1.5px',
      })
      lineEl.appendChild(createDot('top'))
      lineEl.appendChild(createDot('bottom'))
      document.body.appendChild(lineEl)
    }
    return lineEl
  }

  function hide(): void {
    if (lineEl) lineEl.style.display = 'none'
    document.body.style.cursor = ''
    view.dom.style.cursor = ''
  }

  return {
    show(table: HTMLElement, borderX: number): void {
      const line = getOrCreateLine()
      const tableRect = table.getBoundingClientRect()
      line.style.left = `${borderX - 1.5}px`
      line.style.top = `${tableRect.top}px`
      line.style.height = `${tableRect.height}px`
      line.style.display = 'block'
      document.body.style.cursor = 'col-resize'
      view.dom.style.cursor = 'col-resize'
    },
    hide,
    destroy(): void {
      if (lineEl?.parentElement) lineEl.parentElement.removeChild(lineEl)
      lineEl = null
      hide()
    },
  }
}
