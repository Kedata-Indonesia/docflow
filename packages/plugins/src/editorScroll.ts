import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Scroll the editor so document position `pos` is visible.
 *
 * Works with the paginated surface: the scrollable element is the
 * `.docs-editor-scroll` wrapper (DocsEditor), NOT the window — a plain
 * `scrollIntoView()` on the geo-point lands on the wrong page once
 * PaginationPlus has cloned/offset the page frames. We resolve the target from
 * `coordsAtPos` and move the container's scrollTop instead, which is correct in
 * both paginated and pageless mode.
 *
 * Falls back to the native `scrollIntoView` on the editor element when there is
 * no scroll container (bare editor / non-DOM environments such as tests).
 *
 * @param options.focus move the caret to `pos` (default true). Set false when
 *   the caller has already placed the selection.
 */
export function scrollEditorToPos(
  editor: Editor,
  pos: number,
  options: { focus?: boolean } = {},
): void {
  const { state, view } = editor
  const clamped = Math.min(Math.max(0, pos), state.doc.content.size)

  let anchor = clamped
  if (options.focus !== false) {
    // A TOC entry's `pos` is the position *before* the heading block, which is
    // not a text position. `TextSelection.near` walks forward into the heading,
    // so the caret is actually usable (and ProseMirror does not warn about a
    // selection endpoint without inline content).
    const selection = TextSelection.near(state.doc.resolve(clamped), 1)
    if (!state.selection.eq(selection)) {
      view.dispatch(state.tr.setSelection(selection))
    }
    editor.commands.focus()
    anchor = view.state.selection.from
  }

  const editorDom = view.dom as HTMLElement
  const scrollEl = (editorDom.closest?.('.docs-editor-scroll') as HTMLElement | null) ?? null

  let coords: { top: number } | null = null
  try {
    coords = view.coordsAtPos(anchor)
  } catch {
    coords = null
  }

  if (!scrollEl || !coords) {
    editorDom.scrollIntoView?.({ block: 'start' })
    return
  }

  const scrollRect = scrollEl.getBoundingClientRect()
  // Put the target in the upper third of the viewport rather than flush to the
  // top, so the preceding context stays visible.
  const top = scrollEl.scrollTop + (coords.top - scrollRect.top) - scrollEl.clientHeight / 3
  const target = Math.max(0, top)

  try {
    scrollEl.scrollTo({ top: target, behavior: 'smooth' })
  } catch {
    // jsdom / environments without scrollTo — a plain assignment is a no-op there.
    scrollEl.scrollTop = target
  }
}
