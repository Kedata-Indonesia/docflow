import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'
import { ChartNode } from './chartNode.js'
import {
  DEFAULT_CHART_DATA,
  isChartKind,
  serializeChartData,
  type ChartKind,
} from './chartData.js'

/**
 * Chart plugin (issue #26): Insert ▸ Chart ▸ Bar / Column / Line / Pie.
 *
 * One command, `insertChart(kind)`, covers the four menu entries and the slash
 * command. New charts start from a small sample dataset so the node is visible
 * immediately; data is edited in the node's inline CSV editor afterwards.
 */
export const chartPlugin = definePlugin({
  id: 'chart',
  tiptapExtensions: [ChartNode],
  slashCommands: [
    {
      name: 'Chart',
      description: 'Bar, column, line or pie chart',
      command: 'insertChart',
    },
  ],
  commands: {
    insertChart: (editor: Editor, ...args: unknown[]) => {
      const requested = args[0]
      const chartType: ChartKind = isChartKind(requested) ? requested : 'column'
      return editor.chain().focus().insertContent({
        type: 'chart',
        attrs: {
          chartType,
          data: serializeChartData(DEFAULT_CHART_DATA),
        },
      }).run()
    },
  },
})
