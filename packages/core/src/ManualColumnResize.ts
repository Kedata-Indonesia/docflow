import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { createObserverGate } from './manualColumnResize/columnDom.js'
import {
  borderXForHit,
  buildResizePlan,
  hitCell,
  targetColumnForHit,
} from './manualColumnResize/columnGeometry.js'
import { beginResize } from './manualColumnResize/dragSession.js'
import { createHoverIndicator } from './manualColumnResize/hoverIndicator.js'
import { createResizeLine } from './manualColumnResize/resizeLine.js'

/**
 * Custom column-resize extension.
 *
 * Uses native addEventListener (bypasses prosemirror-tables' handleDOMEvents
 * block). Pauses ProseMirror's DOMObserver during DOM manipulation to prevent
 * a re-render from reverting inline style changes. Persists colwidth via a
 * transaction on mouseup.
 *
 * Geometry/measurement lives in `manualColumnResize/columnGeometry.ts`, the DOM
 * writes + observer gate in `columnDom.ts`, the drag loop in `dragSession.ts`,
 * the transaction in `persistColwidths.ts` and the cyan hint in `resizeLine.ts`
 * + `hoverIndicator.ts`.
 *
 * NOTE: this extension must be registered BEFORE the table plugin — see the
 * ordering comment at the registration site in Editor.ts.
 */
export const ManualColumnResize = Extension.create({
  name: 'manualColumnResize',
  addProseMirrorPlugins() {
    const key = new PluginKey('manualColumnResize')
    return [new Plugin({
      key,
      view(editorView: EditorView) {
        const gate = createObserverGate(editorView)
        const line = createResizeLine(editorView)
        let isDragging = false

        const hover = createHoverIndicator({ line, isDragging: () => isDragging })
        hover.attach()

        function onMouseDown(event: MouseEvent): void {
          if (event.button !== 0) return

          const hit = hitCell(event)
          if (!hit) return

          const targetColIdx = targetColumnForHit(hit)
          if (targetColIdx === null) return

          beginResize({
            view: editorView,
            plan: buildResizePlan(hit.table, targetColIdx, event.clientX),
            gate,
            line,
            event,
          })

          if (borderXForHit(hit) === null) return

          // While the drag runs, the hover hint must not follow the pointer.
          isDragging = true
          line.hide()
          const onDragEnd = function () {
            isDragging = false
            line.hide()
            document.removeEventListener('mouseup', onDragEnd, true)
          }
          document.addEventListener('mouseup', onDragEnd, true)
        }

        editorView.dom.addEventListener('mousedown', onMouseDown, true)

        return {
          destroy: function () {
            editorView.dom.removeEventListener('mousedown', onMouseDown, true)
            hover.detach()
            line.destroy()
          },
        }
      },
    })]
  },
})
