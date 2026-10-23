import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import {
  CHART_KINDS,
  DEFAULT_CHART_DATA,
  buildChartConfig,
  chartDataToCsv,
  csvToChartData,
  parseChartData,
  serializeChartData,
} from '../chartData.js'
import { chartPlugin } from '../chart.js'

describe('chartData', () => {
  it('round-trips through the node attribute payload', () => {
    const raw = serializeChartData(DEFAULT_CHART_DATA)
    expect(parseChartData(raw)).toEqual(DEFAULT_CHART_DATA)
  })

  it('returns null for unusable payloads instead of throwing', () => {
    expect(parseChartData('')).toBeNull()
    expect(parseChartData('{')).toBeNull()
    expect(parseChartData('{"labels":["A"],"series":[{"label":"S","values":["x"]}]}')).toBeNull()
  })

  it('round-trips CSV', () => {
    const csv = chartDataToCsv({
      labels: ['Jan', 'Feb'],
      series: [
        { label: 'Revenue', values: [10, 20] },
        { label: 'Cost', values: [5, 8] },
      ],
    })
    expect(csvToChartData(csv)).toEqual({
      labels: ['Jan', 'Feb'],
      series: [
        { label: 'Revenue', values: [10, 20] },
        { label: 'Cost', values: [5, 8] },
      ],
    })
  })

  it('rejects CSV with missing cells or non-numeric values', () => {
    expect(csvToChartData('Label,A\nJan')).toHaveProperty('error')
    expect(csvToChartData('Label,A\nJan,x')).toHaveProperty('error')
    expect(csvToChartData('')).toHaveProperty('error')
  })

  it('maps column/bar onto the bar type with the matching axis', () => {
    const column = buildChartConfig(DEFAULT_CHART_DATA, 'column')
    const bar = buildChartConfig(DEFAULT_CHART_DATA, 'bar')
    expect(column.type).toBe('bar')
    expect(column.options?.indexAxis).toBe('x')
    expect(bar.options?.indexAxis).toBe('y')
    expect(buildChartConfig(DEFAULT_CHART_DATA, 'line').type).toBe('line')
    expect(buildChartConfig(DEFAULT_CHART_DATA, 'pie').type).toBe('pie')
  })
})

describe('chartPlugin', () => {
  let instance: ReturnType<typeof createEditor>

  beforeEach(() => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    instance = createEditor({ target, plugins: [chartPlugin] })
  })

  afterEach(() => {
    const parent = instance.editor.view.dom.parentElement
    instance.destroy()
    parent?.remove()
  })

  it('registers the chart node', () => {
    expect(Object.keys(instance.editor.schema.nodes)).toContain('chart')
  })

  it('inserts a chart of the requested kind', () => {
    expect(instance.pluginActions.insertChart('line')).toBe(true)
    const html = instance.editor.getHTML()
    expect(html).toContain('data-chart-type="line"')
    expect(html).toContain('data-chart-data=')
  })

  it('falls back to a column chart for unknown kinds', () => {
    expect(instance.pluginActions.insertChart('radar')).toBe(true)
    expect(instance.editor.getHTML()).toContain('data-chart-type="column"')
  })

  it('exposes all four kinds for the Insert menu', () => {
    expect([...CHART_KINDS]).toEqual(['bar', 'column', 'line', 'pie'])
  })
})
