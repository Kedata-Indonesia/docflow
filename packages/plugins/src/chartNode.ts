import { Node, mergeAttributes } from '@tiptap/core'
import type { NodeViewRenderer } from '@tiptap/core'
import { createChartNodeView } from './chartNodeView.js'
import {
  DEFAULT_CHART_DATA,
  isChartKind,
  parseChartData,
  serializeChartData,
  type ChartKind,
} from './chartData.js'

/**
 * Chart block node (issue #26).
 *
 * A block atom that stores data, not pixels: `chartType` + JSON `data`. A
 * `preview` PNG is cached alongside it so HTML/DOCX export has a static image
 * (the editor itself renders live with Chart.js — see `chartNodeView.ts`).
 */
export const ChartNode = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      chartType: {
        default: 'column' satisfies ChartKind,
        parseHTML: (el: HTMLElement) => {
          const value = el.getAttribute('data-chart-type')
          return isChartKind(value) ? value : 'column'
        },
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-chart-type': attrs.chartType }),
      },
      data: {
        default: serializeChartData(DEFAULT_CHART_DATA),
        parseHTML: (el: HTMLElement) => el.getAttribute('data-chart-data') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-chart-data': attrs.data }),
      },
      preview: {
        // Cached PNG data URL. Never rendered as an attribute (it can be tens of
        // KB); HTML export embeds it as an `<img>` child instead.
        default: '',
        parseHTML: (el: HTMLElement) => el.querySelector('img')?.getAttribute('src') ?? '',
        renderHTML: () => ({}),
      },
      width: {
        default: 600,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-chart-width')) || 600,
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-chart-width': attrs.width }),
      },
      height: {
        default: 340,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-chart-height')) || 340,
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-chart-height': attrs.height }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-chart-type]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes, {
      class: 'docs-chart',
      'data-chart-type': node.attrs.chartType,
      'data-chart-data': node.attrs.data,
      'data-chart-width': node.attrs.width,
      'data-chart-height': node.attrs.height,
    })
    const preview = typeof node.attrs.preview === 'string' ? node.attrs.preview : ''
    if (!preview) return ['figure', attrs]
    const data = parseChartData(node.attrs.data)
    return [
      'figure',
      attrs,
      ['img', {
        src: preview,
        alt: data?.series.map((series) => series.label).join(', ') || 'Chart',
        width: String(node.attrs.width),
        height: String(node.attrs.height),
      }],
    ]
  },

  addNodeView(): NodeViewRenderer {
    return createChartNodeView
  },
})
