import { AnyExtension, Extension, Editor as TiptapEditor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import {
  collectExtensions,
  createActionMap,
  type DocsEditorPlugin,
} from './PluginSystem.js'
import {
  collaborationExtensions,
  createCollaboration,
  type CollaborationOptions,
  type CollaborationSetup,
} from './Collaboration.js'
import { BlockAttributesExtension } from './BlockAttributes.js'
import { EditorContextExtension } from './EditorContext.js'
import { SearchAndReplaceExtension } from './SearchAndReplace.js'
import type { ImageUploadHandler, CitationPort } from './ports.js'
import type { AIStreamFn } from './ai/types.js'
import { PaginationPlus, type PaginationPlusOptions } from 'tiptap-pagination-plus'

/**
 * Sanitize pasted HTML content (e.g. from Google Docs) to prevent crashes
 * during ProseMirror parsing. Strips non-content tags like <meta>, <style>,
 * and HTML comments that are common in rich clipboard data but not valid
 * in the ProseMirror schema.
 *
 * Also converts Google Docs-specific markup into standard TipTap-compatible
 * HTML so that text color and background-color survive the paste.
 */
export function sanitizePastedHTML(html: string): string {
  // Strip <meta> tags (common in Google Docs clipboard HTML)
  let cleaned = html.replace(/<meta[^>]*>/gi, '')
  // Strip <style> tags and their content
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  // Strip HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')
  // Strip <link> tags (stylesheet links, etc.)
  cleaned = cleaned.replace(/<link[^>]*>/gi, '')
  // Strip <base> tags
  cleaned = cleaned.replace(/<base[^>]*>/gi, '')
  // Strip <title> tags and content
  cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')

  // ── Google Docs: wrap highlighted spans in <mark> while keeping color ────
  // The @tiptap/extension-highlight natively parses <mark> tags but NOT
  // <span> with inline background(-color). We wrap the content so highlight
  // survives paste.
  //   Case A (bg only):  <span style="background:#ff0;">hi</span>
  //     → <mark style="background:#ff0;">hi</mark>
  //   Case B (bg+color): <span style="background:#ff0;color:red;">hi</span>
  //     → <mark style="background:#ff0;"><span style="color:red;">hi</span></mark>
  //
  // Strategy: replace full <span…>…</span> elements (not nested) that have a
  // background style. This avoids the closing‑tag balancing nightmare.
  // Uses a simple non‑recursive approach: match spans that do NOT contain
  // another opening <span inside (i.e. leaf spans).
  {
    // Loop a few times to handle spans that are siblings (not nested)
    for (let pass = 0; pass < 10; pass++) {
      const before = cleaned
      cleaned = cleaned.replace(
        /<span\s([^>]*style\s*=\s*["'][^"']*(?:background-color|background)[^"']*["'][^>]*)>([^<]*(?:<(?!\/?span)[^>]*>[^<]*)*)<\/span>/gi,
        (_full: string, attrs: string, content: string) => {
          if (!/background(?:-color)?\s*:/.test(attrs)) return _full

          // Extract text color (not background-color) from style if present
          // Use negative lookbehind to avoid matching "background-color"
          const colorMatch = attrs.match(/(?<!background-)color\s*:\s*([^;"]+)/i)
          const colorVal = colorMatch ? colorMatch[1].trim() : null

          // Remove the text-color property from mark attributes (keep bg only)
          const markAttrs = colorVal
            ? attrs.replace(/(?<!background-)color\s*:\s*[^;"]+;?\s*/gi, '').trim()
            : attrs

          if (colorVal) {
            return `<mark ${markAttrs}><span style="color: ${colorVal};">${content}</span></mark>`
          }
          return `<mark ${markAttrs}>${content}</mark>`
        },
      )
      if (cleaned === before) break
    }
  }

  // ── Google Docs: <b style="font-weight:normal"> wrapper ──────────────────
  // Google Docs uses <b> as a generic wrapper (not bold) with
  // style="font-weight:normal". Strip the wrapping <b> so it doesn't
  // get parsed as an unwanted Bold mark.
  cleaned = cleaned.replace(
    /<b\s[^>]*style\s*=\s*["'][^"']*font-weight:\s*normal[^"']*["'][^>]*>/gi,
    '',
  )
  cleaned = cleaned.replace(/<\/b>/gi, '')

  // ── Google Docs: remove docs-internal-* id attributes ────────────────────
  cleaned = cleaned.replace(/\sid\s*=\s*["']docs-internal[^"']*["']/gi, '')

  return cleaned
}

// FontSizeExtension is no longer hardcoded here — it is registered
// by fontSizePlugin (packages/plugins/src/fontSize.ts) to avoid
// duplicate extension name collisions caused by Vite modualiasi.

export interface EditorOptions {
  target?: HTMLElement
  content?: object | string
  plugins?: DocsEditorPlugin[]
  editable?: boolean
  onUpdate?: (json: object) => void
  collaboration?: CollaborationOptions
  getPageMap?: () => Map<number, { page: number; blockIndex: number }>
  paginationOptions?: PaginationPlusOptions
  /** Host-injected image upload port (see docs/LIBRARY_CONTRACT.md). */
  onImageUpload?: ImageUploadHandler
  /** Host-injected citation port (Phase 6 — reference library + CSL styles). */
  citation?: CitationPort
  /** Host-injected AI transport (Phase 7 — editor → server → LLM). */
  aiStream?: AIStreamFn
}

export interface DocsEditor {
  editor: TiptapEditor
  collab?: CollaborationSetup
  getJSON: () => object
  getHTML: () => string
  destroy: () => void
  use: (plugin: DocsEditorPlugin) => void
  pluginActions: Record<string, (...args: unknown[]) => boolean>
}

function migrateContent(content: unknown): unknown {
  if (!content) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown
      return JSON.stringify(migrateContent(parsed))
    } catch {
      return content
    }
  }
  if (typeof content !== 'object' || content === null) return content

  const obj = content as Record<string, unknown>

  if (obj.type === 'doc' && Array.isArray(obj.content)) {
    const newContentList: unknown[] = []
    for (const child of obj.content) {
      const childObj = child as Record<string, unknown> | null
      if (childObj && childObj.type === 'page' && Array.isArray(childObj.content)) {
        newContentList.push(...childObj.content)
      } else {
        newContentList.push(child)
      }
    }
    return { ...obj, content: newContentList }
  }

  if (obj.type === 'tabbed-doc' && Array.isArray(obj.tabs)) {
    return {
      ...obj,
      tabs: obj.tabs.map((tab) => ({
        ...(tab as Record<string, unknown>),
        content: migrateContent((tab as Record<string, unknown>).content),
      })),
    }
  }

  return content
}

export function createEditor(options: EditorOptions = {}): DocsEditor {
  const migratedOptions = {
    ...options,
    content: options.content ? (migrateContent(options.content) as string | object | undefined) : options.content
  }
  const plugins = migratedOptions.plugins ?? []
  const collaborationSetup = migratedOptions.collaboration
    ? createCollaboration(migratedOptions.collaboration)
    : undefined

  let tiptapEditor = createTiptapEditor(migratedOptions, plugins, collaborationSetup)
  let pluginActions = createActionMap(tiptapEditor, plugins)

  for (const plugin of plugins) {
    plugin.hooks?.onInit?.(tiptapEditor)
  }

  const rebuildEditor = () => {
    const currentJSON = tiptapEditor.getJSON()
    const selection = tiptapEditor.state.selection
    const target = migratedOptions.target

    tiptapEditor.destroy()
    tiptapEditor = createTiptapEditor(
      { ...migratedOptions, content: currentJSON },
      plugins,
      collaborationSetup,
    )

    try {
      const { from, to } = selection
      if (from >= 0 && to >= from && to <= tiptapEditor.state.doc.content.size) {
        tiptapEditor.commands.setTextSelection({ from, to })
      }
    } catch {
      // Ignore invalid selection after schema change.
    }

    if (target) {
      tiptapEditor.commands.focus()
    }

    pluginActions = createActionMap(tiptapEditor, plugins)
  }

  const editor: DocsEditor = {
    get editor() {
      return tiptapEditor
    },
    collab: collaborationSetup,
    getJSON: () => tiptapEditor.getJSON(),
    getHTML: () => tiptapEditor.getHTML(),
    destroy: () => {
      for (const plugin of plugins) {
        plugin.hooks?.onDestroy?.(tiptapEditor)
      }
      tiptapEditor.destroy()
      collaborationSetup?.destroy()
    },
    use: (plugin) => {
      plugins.push(plugin)
      rebuildEditor()
      plugin.hooks?.onInit?.(tiptapEditor)
    },
    get pluginActions() {
      return pluginActions
    },
  }

  return editor
}

function createTiptapEditor(
  options: EditorOptions,
  plugins: DocsEditorPlugin[],
  collaborationSetup?: CollaborationSetup,
): TiptapEditor {
  const baseStarterKit = options.collaboration
    ? StarterKit.configure({ history: false })
    : StarterKit
  const pluginExtensions = collectExtensions(plugins)

  const blockAttrs = options.getPageMap
    ? BlockAttributesExtension.configure({ pageMap: options.getPageMap })
    : BlockAttributesExtension

  const paginationExt = options.paginationOptions
    ? PaginationPlus.configure(options.paginationOptions)
    : PaginationPlus

  // Custom column-resize extension — registered BEFORE table plugin.
  // Uses native addEventListener (bypasses prosemirror-tables' handleDOMEvents block).
  // Pauses ProseMirror's DOMObserver during DOM manipulation to prevent re-render
  // from reverting inline style changes. Persists colwidth via transaction on mouseup.
  const ManualColumnResize = Extension.create({
    name: 'manualColumnResize',
    addProseMirrorPlugins() {
      const key = new PluginKey('manualColumnResize')
      return [new Plugin({
        key,
        view(view) {
          // Helper: pause ProseMirror's MutationObserver so our DOM changes
          // are not immediately reverted by a re-render.
          function pauseObserver() {
            try { (view as any).domObserver?.stop?.() } catch (_) { /* noop */ }
          }
          function resumeObserver() {
            try { (view as any).domObserver?.start?.() } catch (_) { /* noop */ }
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
            const colIdx = Array.from(parent.children).indexOf(td)
            if (colIdx === -1) return
            const table = td.closest('table') as HTMLElement
            if (!table) return

            const distRight = Math.abs(event.clientX - r.right)
            const distLeft = Math.abs(event.clientX - r.left)

            let targetColIdx = -1
            if (distRight <= 16) {
              targetColIdx = colIdx
            } else if (distLeft <= 16 && colIdx > 0) {
              targetColIdx = colIdx - 1
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
            const startX = event.clientX
            const startW = allColWidths[targetColIdx] || initialWidth(table, targetColIdx)

            // Compute maximum allowed width for target column so total table width
            // does NOT exceed the page container width (prevents overpage overflow).
            const maxContainerW = getMaxContainerWidth(table)
            let otherColsW = 0
            allColWidths.forEach((w, idx) => {
              if (idx !== targetColIdx) {
                otherColsW += w
              }
            })
            const maxNw = Math.max(20, maxContainerW - otherColsW)

            // Helper to update DOM <col>, <td>, and <table> widths for ALL columns in sync
            function updateDOMWidths(targetIdx: number, targetW: number) {
              let totalWidth = 0
              allColWidths.forEach((_, idx) => {
                const w = idx === targetIdx ? targetW : allColWidths[idx]
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
            let moveCount = 0
            const onMove = function (e: MouseEvent) {
              moveCount++
              if (!e.buttons) { onUp(e); return }
              const diff = (e.clientX - startX)
              const nw = Math.min(maxNw, Math.max(20, startW + diff))
              lastNw = nw

              // Live update cyan line at actual column border position during drag
              let borderPos = table.getBoundingClientRect().left
              for (let i = 0; i <= targetColIdx; i++) {
                borderPos += (i === targetColIdx) ? nw : allColWidths[i]
              }
              showLine(table, borderPos)

              // Pause ProseMirror's DOMObserver so it doesn't revert our changes
              pauseObserver()
              updateDOMWidths(targetColIdx, nw)
              resumeObserver()
            }

            const onUp = function (upEvent: MouseEvent) {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp, true)
              upEvent.stopPropagation()
              hideLine()

              if (lastNw === startW) return

              allColWidths[targetColIdx] = lastNw
              console.log('[Resize] onUp:', { lastNw, startW, isLastCol, targetColIdx, allColWidths })

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
                      if (dom === table || (dom instanceof HTMLElement && dom.contains(table)) || table.contains(dom as HTMLElement)) {
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
                    let cellsUpdated = 0
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
                        cellsUpdated++
                        cellColIdx += colspan
                      })
                    })
                    view.dispatch(tr)

                    // Re-apply DOM inline styles to col, cell, and table after transaction
                    // so that Chrome's table-layout: fixed renderer keeps explicit widths for all columns.
                    pauseObserver()
                    updateDOMWidths(targetColIdx, lastNw)
                    resumeObserver()
                  }
                } else {
                  console.warn('[Resize] could not find table position in doc')
                }
              } catch (err) {
                // Fallback: if transaction fails, at least set DOM styles directly
                console.warn('[Resize] transaction failed, falling back to DOM:', err)
                pauseObserver()
                updateDOMWidths(targetColIdx, lastNw)
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

  let extensions: AnyExtension[] = [
    ManualColumnResize,
    baseStarterKit,
    TextStyle,
    blockAttrs,
    paginationExt,
    // Always present — carries host-injected ports (onImageUpload, citation, …)
    // in storage so plugin commands can reach them through the editor instance.
    EditorContextExtension.configure({
      onImageUpload: options.onImageUpload,
      citation: options.citation,
      aiStream: options.aiStream,
    }),
    // Always present — find & replace decorations + state (core editing infra).
    SearchAndReplaceExtension,
    ...pluginExtensions,
  ]
  const content = options.collaboration ? undefined : options.content

  if (options.collaboration && collaborationSetup) {
    // Deliberately NO local seeding from `content` here: in collab mode the Yjs
    // document is authoritative, and an unguarded local seed races with other
    // clients and duplicates the document. Hosts seed via `initialStorageState`
    // or the server's guarded seed endpoint (Phase 1).
    extensions = [...extensions, ...collaborationExtensions(collaborationSetup)]
  }

  return new TiptapEditor({
    element: options.target,
    content,
    extensions,
    editable: options.editable ?? true,
    onUpdate: ({ editor }) => {
      options.onUpdate?.(editor.getJSON())
    },
    editorProps: {
      // Sanitize pasted HTML (strips <meta>, <style>, comments, etc.)
      // before ProseMirror parsing. Prevents crashes from non-content
      // tags commonly produced by Google Docs clipboard data.
      transformPastedHTML: sanitizePastedHTML,
    },
  })
}
