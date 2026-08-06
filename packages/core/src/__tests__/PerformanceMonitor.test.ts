import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPerformanceMonitor, PerformanceMonitor } from '../PerformanceMonitor.js'
import { createEditor } from '../Editor.js'

const WIDGET_SELECTOR = '[data-docflow-perf-monitor]'
const MB = 1024 * 1024

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    monitor?.destroy()
    monitor = null
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('appends a widget to document.body and starts sampling', () => {
    monitor = createPerformanceMonitor()
    const widget = document.body.querySelector(WIDGET_SELECTOR)
    expect(widget).not.toBeNull()
    // Both CPU and RAM rows rendered by default
    expect(widget?.textContent).toContain('CPU')
    expect(widget?.textContent).toContain('RAM')
  })

  it('respects a custom container and metric selection', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    monitor = createPerformanceMonitor({ container, metrics: ['cpu'] })
    const widget = container.querySelector(WIDGET_SELECTOR)
    expect(widget).not.toBeNull()
    expect(widget?.textContent).toContain('CPU')
    expect(widget?.textContent).not.toContain('RAM')
  })

  it('renders known CPU and RAM values via update()', () => {
    monitor = createPerformanceMonitor()
    monitor.update(42, 84 * MB, 512 * MB)
    const text = document.body.querySelector(WIDGET_SELECTOR)?.textContent ?? ''
    expect(text).toContain('42%')
    expect(text).toContain('84MB')
    expect(text).toContain('512MB')
  })

  it('uses kebab-case CSS properties (camelCase is dropped by cssText parsers)', () => {
    // Regression: camelCase in `style.cssText` is silently dropped by real
    // browsers (pointer-events, border-radius, box-shadow, etc.), which would
    // make the widget intercept clicks. All widget styles must be kebab-case.
    monitor = createPerformanceMonitor()
    const style = (document.body.querySelector(WIDGET_SELECTOR) as HTMLElement).getAttribute('style') ?? ''
    expect(style).toMatch(/pointer-events\s*:\s*none/i)
    expect(style).toMatch(/border-radius\s*:\s*8px/i)
    expect(style).toMatch(/box-shadow\s*:\s*0 4px 16px/i)
    expect(style).toMatch(/backdrop-filter\s*:\s*blur\(6px\)/i)
    expect(style).toMatch(/user-select\s*:\s*none/i)
    // camelCase must never leak into the cssText source.
    expect(style).not.toContain('pointerEvents')
    expect(style).not.toContain('borderRadius')
    expect(style).not.toContain('boxShadow')
    expect(style).not.toContain('userSelect')
    expect(style).not.toContain('backdropFilter')
  })

  it('clamps CPU values into the 0–100 range', () => {
    monitor = createPerformanceMonitor({ metrics: ['cpu'] })
    monitor.update(150, undefined, undefined)
    expect(document.body.querySelector(WIDGET_SELECTOR)?.textContent).toContain('100%')
    monitor.update(-5, undefined, undefined)
    expect(document.body.querySelector(WIDGET_SELECTOR)?.textContent).toContain('0%')
  })

  it('removes the widget and stops timers on destroy()', () => {
    monitor = createPerformanceMonitor()
    const widget = document.body.querySelector(WIDGET_SELECTOR) as HTMLElement
    expect(widget).not.toBeNull()
    monitor.destroy()
    expect(document.body.querySelector(WIDGET_SELECTOR)).toBeNull()
    // Destroyed monitor must be inert (no rAF/timer errors, no re-append).
    expect(() => monitor?.destroy()).not.toThrow()
    monitor = null
  })

  it('does not auto-start sampling when constructed directly', () => {
    monitor = new PerformanceMonitor()
    expect(document.body.querySelector(WIDGET_SELECTOR)).toBeNull()
    monitor.start()
    expect(document.body.querySelector(WIDGET_SELECTOR)).not.toBeNull()
  })
})

describe('createEditor with debug flag', () => {
  let target: HTMLDivElement
  let editor: ReturnType<typeof createEditor> | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.innerHTML = ''
  })

  it('starts a performance monitor when debug: true', () => {
    editor = createEditor({ target, debug: true })
    expect(editor.performanceMonitor).toBeDefined()
    expect(document.body.querySelector(WIDGET_SELECTOR)).not.toBeNull()
  })

  it('does not start a monitor by default (debug off)', () => {
    editor = createEditor({ target })
    expect(editor.performanceMonitor).toBeUndefined()
    expect(document.body.querySelector(WIDGET_SELECTOR)).toBeNull()
  })

  it('removes the debug widget on editor destroy()', () => {
    editor = createEditor({ target, debug: true })
    expect(document.body.querySelector(WIDGET_SELECTOR)).not.toBeNull()
    editor.destroy()
    expect(document.body.querySelector(WIDGET_SELECTOR)).toBeNull()
    editor = null
  })
})
