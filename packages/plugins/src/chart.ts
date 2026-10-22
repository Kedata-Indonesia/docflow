import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Node, Extension, mergeAttributes } from '@tiptap/core'

/**
 * Chart node representing visual charts (Bar, Column, Line, Pie).
 */
export const ChartNode = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      chartType: {
        default: 'bar',
        parseHTML: el => el.getAttribute('data-chart-type') || 'bar',
        renderHTML: attrs => ({ 'data-chart-type': attrs.chartType }),
      },
      title: {
        default: 'Chart Visualization',
        parseHTML: el => el.getAttribute('data-title') || 'Chart Visualization',
        renderHTML: attrs => ({ 'data-title': attrs.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const chartType = node.attrs.chartType as string
    const title = node.attrs.title as string
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'chart',
      class: 'docs-chart-block my-4 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900',
    }),
      ['div', { class: 'font-semibold text-sm mb-2 text-slate-700 dark:text-slate-300' }, title],
      ['div', { class: 'text-xs text-slate-500 italic uppercase tracking-wider mb-3' }, `Type: ${chartType}`],
      ['div', { class: 'h-32 flex items-end gap-2 bg-slate-50 dark:bg-slate-800 p-3 rounded border border-dashed border-slate-300 dark:border-slate-700 justify-around' },
        ['div', { class: 'w-8 bg-indigo-500 rounded-t h-[60%]' }],
        ['div', { class: 'w-8 bg-emerald-500 rounded-t h-[80%]' }],
        ['div', { class: 'w-8 bg-amber-500 rounded-t h-[40%]' }],
        ['div', { class: 'w-8 bg-rose-500 rounded-t h-[90%]' }]
      ]
    ]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: {
      insertChart: (options?: { type?: string; title?: string }) => ReturnType
    }
  }
}

export const ChartCommandsExtension = Extension.create({
  name: 'chartCommands',
  addCommands() {
    return {
      insertChart:
        (options?: { type?: string; title?: string }) =>
        ({ chain }): boolean => {
          const chartType = options?.type || 'bar'
          const title = options?.title || `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`
          return chain()
            .focus()
            .insertContent({
              type: 'chart',
              attrs: { chartType, title },
            })
            .run()
        },
    }
  },
})

export const chartPlugin = definePlugin({
  id: 'chart',
  tiptapExtensions: [ChartNode, ChartCommandsExtension],
  slashCommands: [
    { name: 'Bar Chart', description: 'Insert bar chart', command: 'insertChart' },
    { name: 'Column Chart', description: 'Insert column chart', command: 'insertChart' },
    { name: 'Line Chart', description: 'Insert line chart', command: 'insertChart' },
    { name: 'Pie Chart', description: 'Insert pie chart', command: 'insertChart' },
  ],
})
