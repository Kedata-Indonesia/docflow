import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * Custom column-resize extension.
 *
 * Uses native addEventListener (bypasses prosemirror-tables' handleDOMEvents
 * block). Pauses ProseMirror's DOMObserver during DOM manipulation to prevent
 * re-render from reverting inline style changes. Persists colwidth via
 * transaction on mouseup.
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
      view(view) {
        // Narrow structural type for ProseMirror's internal DOMObserver, which
        // is not part of the public typings.
        const observer = view as unknown as {
          domObserver?: { stop?: () => void; start?: () => void }
        }

        // Helper: pause ProseMirror's MutationObserver so our DOM changes
        // are not immediately reverted by a re-render.
        function pauseObserver() {
          try { observer.domObserver?.stop?.() } catch (_) { /* noop */ }
        }
        function resumeObserver() {
          try { observer.domObserver?.start?.() } catch (_) { /* noop */ }
        }

        // Helper: get available content width inside the paper container
        function getMaxContainerWidth(tableEl: HTMLElement): number {
          let curr: HTMLElement | null = tableEl.parentElement
          while (curr) {
            const style = window.getComputedStyle(curr)
            const paddingLeft = parseFloat(style.paddingLeft) || 0
            const paddingRight = parseFloat(style.paddingRight) || 0
            const availWidth = curr.clientWidth - paddingLeft - paddingRight
            if (availWidth > 100 && (
              curr.classList.contains('docs-editor__paper') ||
              curr.classList.contains('docs-editor-page') ||
              curr.classList.contains('ProseMirror') ||
              curr.classList.contains('rm-with-pagination')
            )) {
              return availWidth
            }
            curr = curr.parentElement
          }
          return tableEl.parentElement?.clientWidth || 614
        }

        const onMouseDown = function (event: MouseEvent) {
          if (event.button !== 0) return
          const td = (event.target as HTMLElement).closest('td, th') as HTMLElement
          if (!td) return
          const r = td.getBoundingClientRect()
          const parent = td.parentElement
          if (!parent) return
          // Logical (colspan-aware) column index of the clicked cell. The DOM
          // child index differs from the logical column index when the table has
          // merged cells, which is common in tables pasted from Google Docs/Word
          // (#55). Without this, widths get assigned to the wrong column.
          const cellColSpan = (td as HTMLTableCellElement).colSpan || 1
          let logicalStart = 0
          let foundCell = false
          for (const sibling of Array.from(parent.children)) {
            if (sibling === td) { foundCell = true; break }
            logicalStart += (sibling as HTMLTableCellElement).colSpan || 1
          }
          if (!foundCell) return
          const table = td.closest('table') as HTMLElement
          if (!table) return

          const distRight = Math.abs(event.clientX - r.right)
          const distLeft = Math.abs(event.clientX - r.left)

          let targetColIdx = -1
          if (distRight <= 16) {
            // Right edge of this (possibly merged) cell → its last logical column.
            targetColIdx = logicalStart + cellColSpan - 1
          } else if (distLeft <= 16 && logicalStart > 0) {
            // Left edge → resize the logical column just before this cell.
            targetColIdx = logicalStart - 1
          } else {
            return
          }

          // Compute initial widths for ALL columns in the table so no column is left un-sized
          const colsList = table.querySelectorAll('colgroup col')
          const totalCols = colsList.length || table.querySelector('tr')?.children.length || 0
          const allColWidths: number[] = []
          for (let c = 0; c < totalCols; c++) {
            const colEl = colsList[c] as HTMLElement
            const w = colEl ? parseFloat(colEl.style.width) : 0
            allColWidths[c] = w || initialWidth(table, c)
          }
          const isLastCol = targetColIdx === totalCols - 1
          const neighborIdx = targetColIdx + 1
          const startX = event.clientX
          const startW = allColWidths[targetColIdx] || initialWidth(table, targetColIdx)
          // The adjacent column that absorbs the delta in redistributive mode.
          // For the last column there is no neighbor — its right border resizes
          // the total table width instead.
          const startNeighborW = !isLastCol
            ? (allColWidths[neighborIdx] || initialWidth(table, neighborIdx))
            : 0

          // Max container width — only used to clamp the last-column (total-width)
          // resize so the table never overflows the page. Internal-border drags
          // keep the total width constant, so they never need this clamp (#116).
          const maxContainerW = getMaxContainerWidth(table)
          let otherColsW = 0
          allColWidths.forEach((w, idx) => {
            if (idx !== targetColIdx) otherColsW += w
          })
          const maxNwLastCol = Math.max(20, maxContainerW - otherColsW)

          // Helper to update DOM <col>, <td>, and <table> widths for ALL columns
          // from the authoritative `allColWidths` array (colgroup cols drive the
          // layout under `table-layout: fixed`; the per-cell writes reinforce it).
          function updateDOMWidths() {
            let totalWidth = 0
            allColWidths.forEach((w, idx) => {
              const col = table.querySelector(`colgroup col:nth-child(${idx + 1})`) as HTMLElement
              if (col) col.style.setProperty('width', w + 'px', 'important')
              table.querySelectorAll('tr').forEach(function (row: Element) {
                const cell = row.children[idx] as HTMLElement
                if (cell) {
                  cell.style.setProperty('width', w + 'px', 'important')
                  cell.setAttribute('width', String(w))
                }
              })
              totalWidth += w
            })
            if (totalWidth > 0) {
              table.style.setProperty('width', Math.min(totalWidth, maxContainerW) + 'px', 'important')
            }
          }

          // stopPropagation prevents ProseMirror from handling mousedown
          // (capture phase fires before ProseMirror's bubble-phase handler).
          // Do NOT call preventDefault() — browser needs it for mousemove e.buttons.
          event.stopPropagation()

          let lastNw = startW
          const onMove = function (e: MouseEvent) {
            if (!e.buttons) { onUp(e); return }
            const rawDiff = e.clientX - startX

            if (isLastCol) {
              // Total-width resize: only the dragged (last) column changes.
              const nw = Math.min(maxNwLastCol, Math.max(20, startW + rawDiff))
              allColWidths[targetColIdx] = nw
              lastNw = nw
            } else {
              // Redistributive resize (#116): the dragged column grows by Δ and
              // its right neighbor shrinks by Δ, keeping total width constant.
              // Clamp Δ so neither column drops below the 20px minimum:
              //   upper bound → neighbor stays ≥ 20 (rawDiff ≤ startNeighborW − 20)
              //   lower bound → target stays ≥ 20   (rawDiff ≥ 20 − startW)
              const delta = Math.max(20 - startW, Math.min(rawDiff, startNeighborW - 20))
              allColWidths[targetColIdx] = startW + delta
              allColWidths[neighborIdx] = startNeighborW - delta
              lastNw = allColWidths[targetColIdx]
            }

            // Live cyan line at the dragged border position during the drag.
            let borderPos = table.getBoundingClientRect().left
            for (let i = 0; i <= targetColIdx; i++) borderPos += allColWidths[i]
            showLine(table, borderPos)

            // Pause ProseMirror's DOMObserver so it doesn't revert our changes.
            pauseObserver()
            updateDOMWidths()
            resumeObserver()
          }

          const onUp = function (upEvent: MouseEvent) {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp, true)
            upEvent.stopPropagation()
            hideLine()

            if (lastNw === startW) return

            // allColWidths[targetColIdx] (and the neighbor, for redistributive
            // drags) is already up to date from onMove — persist via transaction.

            // Persist colwidth for ALL columns via ProseMirror transaction — this is the only
            // way to ensure complete table structure survives re-renders (typing, selection, etc.).
            try {
              const { state } = view
              const { doc } = state
              let tablePos = -1

              // Find the table node in the document that corresponds to our DOM table
              doc.descendants((node, pos) => {
                if (tablePos >= 0) return false
                if (node.type.name === 'table') {
                  try {
                    const dom = view.nodeDOM(pos)
                    if (
                      dom === table ||
                      (dom instanceof HTMLElement && dom.contains(table)) ||
                      table.contains(dom as HTMLElement)
                    ) {
                      tablePos = pos
                      return false
                    }
                  } catch (_) { /* continue searching */ }
                }
                return true
              })

              if (tablePos >= 0) {
                const tableNode = doc.nodeAt(tablePos)
                if (tableNode) {
                  const tr = state.tr
                  // Walk rows → cells, update colwidth for ALL columns
                  tableNode.forEach((row, rowOffset) => {
                    let cellColIdx = 0
                    row.forEach((cell, cellOffset) => {
                      const colspan = cell.attrs.colspan || 1
                      const cellPos = tablePos + 1 + rowOffset + 1 + cellOffset
                      const cw = new Array(colspan)
                      for (let k = 0; k < colspan; k++) {
                        cw[k] = allColWidths[cellColIdx + k] || 100
                      }
                      tr.setNodeMarkup(cellPos, null, { ...cell.attrs, colwidth: cw })
                      cellColIdx += colspan
                    })
                  })
                  view.dispatch(tr)

                  // Re-apply DOM inline styles to col, cell, and table after transaction
                  // so that Chrome's table-layout: fixed renderer keeps explicit widths for all columns.
                  pauseObserver()
                  updateDOMWidths()
                  resumeObserver()
                }
              } else {
                console.warn('[Resize] could not find table position in doc')
              }
            } catch (err) {
              // Fallback: if transaction fails, at least set DOM styles directly
              console.warn('[Resize] transaction failed, falling back to DOM:', err)
              pauseObserver()
              updateDOMWidths()
              resumeObserver()
            }
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp, true)
        }

        // Helper: get a column's rendered width from its first-row cell
        function initialWidth(table: HTMLElement, colIdx: number): number {
          const firstRow = table.querySelector('tr')
          if (!firstRow) return 100
          const cell = firstRow.children[colIdx] as HTMLElement
          if (!cell) return 100
          return Math.round(cell.getBoundingClientRect().width) || cell.offsetWidth || 100
        }

        // ── Resize handle indicator (position:fixed cyan line on hover) ──
        let lineEl: HTMLElement | null = null
        let isDragging = false

        function getOrCreateLine(): HTMLElement {
          if (!lineEl) {
            lineEl = document.createElement('div')
            lineEl.className = 'docflow-active-border-line'
            Object.assign(lineEl.style, {
              position: 'fixed',
              width: '3px',
              background: '#06b6d4',
              boxShadow: '0 0 8px rgba(6, 182, 212, 0.9)',
              pointerEvents: 'none',
              zIndex: '999999',
              display: 'none',
              borderRadius: '1.5px',
            })
            // Top dot
            const dotTop = document.createElement('div')
            Object.assign(dotTop.style, {
              position: 'absolute',
              top: '-4px',
              left: '-3.5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '2px solid #06b6d4',
            })
            // Bottom dot
            const dotBottom = document.createElement('div')
            Object.assign(dotBottom.style, {
              position: 'absolute',
              bottom: '-4px',
              left: '-3.5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '2px solid #06b6d4',
            })
            lineEl.appendChild(dotTop)
            lineEl.appendChild(dotBottom)
            document.body.appendChild(lineEl)
          }
          return lineEl
        }

        function showLine(table: HTMLElement, borderX: number) {
          const line = getOrCreateLine()
          const tableRect = table.getBoundingClientRect()
          line.style.left = `${borderX - 1.5}px`
          line.style.top = `${tableRect.top}px`
          line.style.height = `${tableRect.height}px`
          line.style.display = 'block'
          document.body.style.cursor = 'col-resize'
          view.dom.style.cursor = 'col-resize'
        }

        function hideLine() {
          if (lineEl) {
            lineEl.style.display = 'none'
          }
          document.body.style.cursor = ''
          view.dom.style.cursor = ''
        }

        const onMouseMoveHover = function (event: MouseEvent) {
          if (isDragging) return
          const target = event.target as HTMLElement
          const td = target.closest('td, th') as HTMLElement
          if (!td) { hideLine(); return }

          const r = td.getBoundingClientRect()
          const distRight = Math.abs(event.clientX - r.right)
          const distLeft = Math.abs(event.clientX - r.left)
          const parent = td.parentElement
          if (!parent) { hideLine(); return }
          const colIdx = Array.from(parent.children).indexOf(td)

          let borderX = -1
          if (distRight <= 16) {
            borderX = r.right
          } else if (distLeft <= 16 && colIdx > 0) {
            borderX = r.left
          }

          if (borderX >= 0) {
            const table = td.closest('table') as HTMLElement
            if (table) {
              showLine(table, borderX)
            }
          } else {
            hideLine()
          }
        }

        document.addEventListener('mousemove', onMouseMoveHover, true)
        view.dom.addEventListener('mousedown', function handleMouseDown(event: MouseEvent) {
          onMouseDown(event)
          const td = (event.target as HTMLElement).closest('td, th') as HTMLElement
          if (!td) return
          const r = td.getBoundingClientRect()
          const distRight = Math.abs(event.clientX - r.right)
          const distLeft = Math.abs(event.clientX - r.left)
          const parent = td.parentElement
          if (!parent) return
          const colIdx = Array.from(parent.children).indexOf(td)
          if (distRight <= 16 || (distLeft <= 16 && colIdx > 0)) {
            isDragging = true
            hideLine()
            const onDragEnd = function () {
              isDragging = false
              hideLine()
              document.removeEventListener('mouseup', onDragEnd, true)
            }
            document.addEventListener('mouseup', onDragEnd, true)
          }
        }, true)

        return {
          destroy: function () {
            document.removeEventListener('mousemove', onMouseMoveHover, true)
            if (lineEl && lineEl.parentElement) {
              lineEl.parentElement.removeChild(lineEl)
            }
            lineEl = null
            hideLine()
          }
        }
      },
    })]
  },
})
