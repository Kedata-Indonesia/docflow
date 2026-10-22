import { describe, it, expect } from 'vitest'
import { createEditor } from '@kedata-indonesia/docflow-core'
import { chartPlugin } from '../chart.js'

describe('chart plugin', () => {
  it('registers the chart node and insertChart command', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const { editor, destroy } = createEditor({
      target,
      plugins: [chartPlugin],
      content: '<p>Hello</p>',
    })

    expect(editor.schema.nodes.chart).toBeDefined()
    expect(typeof editor.commands.insertChart).toBe('function')

    editor.commands.insertChart({ type: 'bar', title: 'Sales Bar Chart' })
    const json = editor.getJSON()
    const chartNode = json.content?.find(n => n.type === 'chart')
    expect(chartNode).toBeDefined()
    expect(chartNode?.attrs?.chartType).toBe('bar')
    expect(chartNode?.attrs?.title).toBe('Sales Bar Chart')

    destroy()
    target.remove()
  })
})
