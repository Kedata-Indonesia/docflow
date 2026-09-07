import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/**
 * PaginationCaretFix — correct caret/selection placement for mouse clicks under
 * the pagination layout.
 *
 * Why: under `rm-with-pagination` (see ./PaginationPlus.ts) the editor root
 * gets large page padding and per-page widgets (headers, footers, gaps, page
 * breaks) are inserted between blocks. Because of that the screen-coordinate →
 * document-position mapping done by ProseMirror (`EditorView.posAtCoords`) can
 * fall back to the **start of the clicked block**, so clicking in the middle of
 * a paragraph drops the caret at the beginning of that paragraph.
 *
 * The browser-native `caretRangeFromPoint` is unaffected by our layout
 * wrappers and resolves the clicked text node + character offset correctly.
 * For a plain single left click we therefore take over completely (custom
 * `handleDOMEvents.mousedown` runs before ProseMirror's built-in handler;
 * returning `true` stops it): we place the caret at the native-mapped position
 * and track a possible drag ourselves.
 *
 * Guards (everything else keeps its normal ProseMirror behaviour):
 * - Only active while pagination is on (`rm-with-pagination` + no
 *   `rm-pagination-disabled` attribute) and the editor is editable.
 * - Only plain single left clicks (no Shift/Ctrl/Alt/Meta, `event.detail === 1`),
 *   so drag-selection started elsewhere, double/triple-click word/block
 *   selection, and modifier clicks stay untouched.
 * - Only when the click actually lands on editable text (native position is
 *   resolvable); clicks on gaps, page breaks, widgets, empty paragraphs etc.
 *   fall through to ProseMirror.
 */

const PAGINATION_CLASS = 'rm-with-pagination'
const PAGINATION_DISABLED_ATTR = 'rm-pagination-disabled'

/** Per-view active drag state installed while the user drags after an intercepted click. */
interface DragState {
  anchorPos: number
  onMouseMove: (event: MouseEvent) => void
  onMouseUp: () => void
}

const dragStates = new WeakMap<EditorView, DragState>()

const isPaginationActive = (view: EditorView): boolean => {
  const dom = view.dom as HTMLElement
  return (
    dom.classList.contains(PAGINATION_CLASS) &&
    dom.getAttribute(PAGINATION_DISABLED_ATTR) === null
  )
}

const isEditable = (view: EditorView): boolean =>
  (view.dom as HTMLElement).getAttribute('contenteditable') !== 'false'

const isPlainSingleLeftClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  event.detail === 1 &&
  !event.shiftKey &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey

/**
 * Maps a text node + character offset to a ProseMirror document position,
 * or `null` when the node/offset does not map to an editable textblock.
 * Exported for unit tests.
 */
export function posFromTextOffset(view: EditorView, textNode: Node, offset: number): number | null {
  if (textNode.nodeType !== Node.TEXT_NODE || !view.dom.contains(textNode)) return null
  const text = textNode as Text
  const clamped = Math.min(Math.max(0, offset), text.length)
  const parent = text.parentElement
  if (parent?.closest?.('[contenteditable="false"]')) return null

  let pos = view.posAtDOM(text, clamped, -1)
  if (pos < 0) pos = view.posAtDOM(text, clamped, 1)
  if (pos < 0) return null
  return view.state.doc.resolve(pos).parent.isTextblock ? pos : null
}

/**
 * Resolves the clicked document position from browser-native hit testing
 * (`document.caretRangeFromPoint`). Returns `null` when the environment does
 * not expose it (e.g. jsdom/happy-dom) or the click did not land on editable
 * text. Exported for unit tests.
 */
export function resolvePosFromNativePoint(
  view: EditorView,
  clientX: number,
  clientY: number,
): number | null {
  const doc = view.dom.ownerDocument
  if (typeof doc.caretRangeFromPoint !== 'function') return null
  const range = doc.caretRangeFromPoint(clientX, clientY)
  if (!range) return null
  return posFromTextOffset(view, range.startContainer, range.startOffset)
}

/** Cleans up the drag listeners of an intercepted click. */
function stopDrag(view: EditorView): void {
  const drag = dragStates.get(view)
  if (!drag) return
  dragStates.delete(view)
  const doc = view.dom.ownerDocument
  doc.removeEventListener('mousemove', drag.onMouseMove)
  doc.removeEventListener('mouseup', drag.onMouseUp)
}

/**
 * Starts drag selection tracking after an intercepted plain click. Called
 * right after the caret was placed at `anchorPos`.
 */
function beginDrag(view: EditorView, anchorPos: number): void {
  stopDrag(view)
  const doc = view.dom.ownerDocument

  const onMouseMove = (event: MouseEvent): void => {
    const drag = dragStates.get(view)
    if (!drag) return
    const pos = resolvePosFromNativePoint(view, event.clientX, event.clientY)
    if (pos === null) return
    const from = Math.min(drag.anchorPos, pos)
    const to = Math.max(drag.anchorPos, pos)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  }

  const onMouseUp = (): void => {
    stopDrag(view)
  }

  dragStates.set(view, { anchorPos, onMouseMove, onMouseUp })
  doc.addEventListener('mousemove', onMouseMove)
  doc.addEventListener('mouseup', onMouseUp)
}

/**
 * Core logic: fully handle a plain single left click on editable text under an
 * active pagination layout. Returns `true` when the click was handled (caller
 * must stop ProseMirror's built-in handler); `false` lets ProseMirror run.
 * Exported for unit tests.
 */
export function interceptPaginationMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (!isPaginationActive(view) || !isPlainSingleLeftClick(event) || !isEditable(view)) return false

  const pos = resolvePosFromNativePoint(view, event.clientX, event.clientY)
  if (pos === null) return false

  view.focus()
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
  beginDrag(view, pos)
  return true
}

export const PaginationCaretFix = Extension.create({
  name: 'paginationCaretFix',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('paginationCaretFix'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              try {
                return interceptPaginationMouseDown(view, event as MouseEvent)
              } catch {
                // Never let caret handling crash the editor.
                return false
              }
            },
          },
        },
      }),
    ]
  },
})
