import type { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Chart } from 'chart.js'
import {
  CHART_KINDS,
  DEFAULT_CHART_DATA,
  buildChartConfig,
  chartDataToCsv,
  csvToChartData,
  parseChartData,
  type ChartData,
  type ChartKind,
} from './chartData.js'

type ChartConstructor = (typeof import('chart.js/auto'))['default']

/** Chart.js is ~70 KB gzip — load it only when a document actually has a chart. */
let chartModule: Promise<ChartConstructor> | null = null
function loadChartConstructor(): Promise<ChartConstructor> {
  chartModule ??= import('chart.js/auto').then((mod) => mod.default)
  return chartModule
}

const KIND_LABELS: Record<ChartKind, string> = {
  bar: 'Bar',
  column: 'Column',
  line: 'Line',
  pie: 'Pie',
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

/**
 * Live chart node view: a Chart.js canvas plus a small toolbar (type switch and
 * an inline CSV data editor). Every change goes through node attributes, so the
 * document — not the DOM — stays the single source of truth.
 *
 * After each render the canvas is cached as a PNG data URL in the `preview`
 * attribute (no history entry): exports and copy-paste then have a static image
 * without re-rendering Chart.js outside the browser.
 */
export const createChartNodeView: NodeViewRenderer = (props: NodeViewRendererProps) => {
  let currentNode: PMNode = props.node
  let chart: Chart | null = null
  let destroyed = false

  const getPos = () => (typeof props.getPos === 'function' ? props.getPos() : undefined)
  const dispatchAttrs = (attrs: Record<string, unknown>) => {
    const pos = getPos()
    if (typeof pos !== 'number' || props.view.isDestroyed) return
    // Merge, never replace: `setNodeMarkup` drops attributes it is not given,
    // which would reset `chartType`/`data` to their defaults on a preview write.
    const tr = props.view.state.tr.setNodeMarkup(pos, undefined, {
      ...currentNode.attrs,
      ...attrs,
    })
    tr.setMeta('addToHistory', false)
    props.view.dispatch(tr)
  }

  const dom = el('figure', 'docs-chart')
  dom.setAttribute('contenteditable', 'false')

  const toolbar = el('div', 'docs-chart__toolbar')
  const typeSelect = el('select', 'docs-chart__type')
  typeSelect.setAttribute('aria-label', 'Chart type')
  for (const kind of CHART_KINDS) {
    const option = document.createElement('option')
    option.value = kind
    option.textContent = KIND_LABELS[kind]
    typeSelect.appendChild(option)
  }
  typeSelect.addEventListener('change', () => {
    const kind = typeSelect.value as ChartKind
    dispatchAttrs({ chartType: kind, preview: '' })
  })

  const editButton = el('button', 'docs-chart__edit')
  editButton.type = 'button'
  editButton.textContent = 'Edit data'

  toolbar.append(typeSelect, editButton)

  const canvasWrap = el('div', 'docs-chart__canvas')
  const canvas = document.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvasWrap.appendChild(canvas)

  const editor = el('div', 'docs-chart__editor')
  editor.hidden = true
  const textarea = el('textarea', 'docs-chart__textarea')
  textarea.setAttribute('aria-label', 'Chart data as CSV')
  textarea.spellcheck = false
  const errorText = el('p', 'docs-chart__error')
  const actions = el('div', 'docs-chart__actions')
  const applyButton = el('button', 'docs-chart__apply')
  applyButton.type = 'button'
  applyButton.textContent = 'Apply'
  const cancelButton = el('button', 'docs-chart__cancel')
  cancelButton.type = 'button'
  cancelButton.textContent = 'Cancel'
  actions.append(applyButton, cancelButton)
  editor.append(textarea, errorText, actions)

  dom.append(toolbar, canvasWrap, editor)

  // Clicks inside the chrome must not move the editor selection or open the
  // node's own selection ring.
  for (const chrome of [toolbar, editor]) {
    chrome.addEventListener('mousedown', (event) => event.stopPropagation())
  }

  const readData = (): ChartData => parseChartData(currentNode.attrs.data) ?? DEFAULT_CHART_DATA
  const readKind = (): ChartKind => {
    const kind = currentNode.attrs.chartType
    return CHART_KINDS.includes(kind as ChartKind) ? (kind as ChartKind) : 'column'
  }

  const syncEditor = () => {
    textarea.value = chartDataToCsv(readData())
    errorText.textContent = ''
  }

  const toggleEditor = (open: boolean) => {
    editor.hidden = !open
    if (open) {
      syncEditor()
      textarea.focus()
    }
  }
  editButton.addEventListener('click', () => toggleEditor(editor.hidden))
  cancelButton.addEventListener('click', () => toggleEditor(false))
  applyButton.addEventListener('click', () => {
    const result = csvToChartData(textarea.value)
    if ('error' in result) {
      errorText.textContent = result.error
      return
    }
    dispatchAttrs({ data: JSON.stringify(result), preview: '' })
    toggleEditor(false)
  })

  const capturePreview = () => {
    if (!chart || destroyed) return
    let preview = ''
    try {
      preview = chart.toBase64Image('image/png', 1)
    } catch {
      return
    }
    if (!preview || preview === currentNode.attrs.preview) return
    dispatchAttrs({ preview })
  }

  const draw = async () => {
    const data = readData()
    const kind = readKind()
    typeSelect.value = kind
    canvas.setAttribute('aria-label', `${KIND_LABELS[kind]} chart`)

    let ChartCtor: ChartConstructor
    try {
      ChartCtor = await loadChartConstructor()
    } catch {
      return
    }
    if (destroyed) return

    chart?.destroy()
    try {
      chart = new ChartCtor(canvas, buildChartConfig(data, kind)) as unknown as Chart
    } catch {
      // No 2D canvas (SSR, jsdom/happy-dom, very old browsers): the node keeps
      // its data and exports still work from the cached preview, if any.
      chart = null
      return
    }
    window.requestAnimationFrame(capturePreview)
  }

  void draw()

  return {
    dom,
    update(updatedNode: PMNode): boolean {
      if (updatedNode.type.name !== 'chart') return false
      const dataChanged = updatedNode.attrs.data !== currentNode.attrs.data
      const typeChanged = updatedNode.attrs.chartType !== currentNode.attrs.chartType
      currentNode = updatedNode
      if (dataChanged || typeChanged) void draw()
      else typeSelect.value = readKind()
      return true
    },
    ignoreMutation: () => true,
    destroy() {
      destroyed = true
      chart?.destroy()
      chart = null
    },
  }
}
