/**
 * Lightweight client-side performance monitor (debug overlay).
 *
 * Shows current CPU utilization (event-loop busy time measured via
 * `requestAnimationFrame` + the Long Tasks API) and JS heap usage in a
 * semi-transparent widget pinned to the bottom-right corner of the viewport.
 *
 * The widget is opt-in and controlled by the host through the `debug: true`
 * EditorOptions flag, so it never appears in production builds unless the
 * consumer enables it. Because it is implemented with plain DOM + inline
 * styles (no CSS imports, no framework), it works in every host surface the
 * library ships: vanilla `createEditor()`, the Vue component, and the
 * `<docs-editor>` Web Component (Shadow DOM).
 *
 * This is a pure debug *view* — it never reads or mutates the ProseMirror
 * document, so the "single source of truth" and LIBRARY_CONTRACT rules hold.
 */

export type MonitorMetric = 'cpu' | 'ram'

export interface PerformanceMonitorOptions {
  /** Element the widget is appended to. Defaults to `document.body`. */
  container?: HTMLElement
  /** Refresh interval in ms. Defaults to 1000. */
  interval?: number
  /** Which metrics to render. Defaults to `['cpu', 'ram']`. */
  metrics?: MonitorMetric[]
}

const TARGET_FRAME_MS = 1000 / 60

interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

const formatMb = (bytes: number): string => `${Math.round(bytes / 1024 / 1024)}MB`

export class PerformanceMonitor {
  private readonly container: HTMLElement
  private readonly interval: number
  private readonly metrics: Set<MonitorMetric>

  private root: HTMLElement | null = null
  private cpuBar: HTMLElement | null = null
  private cpuValue: HTMLElement | null = null
  private ramBar: HTMLElement | null = null
  private ramValue: HTMLElement | null = null

  private rafId = 0
  private lastFrame = 0
  private busyMs = 0
  private windowStart = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private longTaskObserver: PerformanceObserver | null = null
  private destroyed = false

  constructor(options: PerformanceMonitorOptions = {}) {
    this.container =
      options.container ?? (typeof document !== 'undefined' ? document.body : (undefined as unknown as HTMLElement))
    this.interval = options.interval ?? 1000
    this.metrics = new Set(options.metrics ?? ['cpu', 'ram'])
  }

  /** Append the widget to the container and start sampling. */
  start(): void {
    if (this.destroyed || this.root) return
    if (!this.container || typeof window === 'undefined' || typeof document === 'undefined') return

    this.buildWidget()
    this.windowStart = performance.now()
    this.lastFrame = this.windowStart
    this.busyMs = 0

    this.rafId = requestAnimationFrame(this.onFrame)
    this.longTaskObserver = this.createLongTaskObserver()
    this.timer = setInterval(this.onTick, this.interval)
  }

  /**
   * Render a fresh snapshot. Used by the internal ticker; also public so
   * tests and hosts can render known values (values are optional — a metric
   * without a value keeps its previous text).
   */
  update(cpuPercent?: number, ramBytes?: number, ramLimitBytes?: number): void {
    if (!this.root) return
    if (typeof cpuPercent === 'number') {
      const clamped = Math.max(0, Math.min(100, cpuPercent))
      this.renderBar(this.cpuBar, clamped)
      if (this.cpuValue) this.cpuValue.textContent = `${Math.round(clamped)}%`
    }
    if (typeof ramBytes === 'number') {
      const pct = typeof ramLimitBytes === 'number' && ramLimitBytes > 0
        ? Math.max(0, Math.min(100, (ramBytes / ramLimitBytes) * 100))
        : 0
      this.renderBar(this.ramBar, pct)
      if (this.ramValue) {
        this.ramValue.textContent =
          typeof ramLimitBytes === 'number' && ramLimitBytes > 0
            ? `${formatMb(ramBytes)} / ${formatMb(ramLimitBytes)}`
            : formatMb(ramBytes)
      }
    }
  }

  /** Stop sampling, disconnect observers, and remove the widget. */
  destroy(): void {
    this.destroyed = true
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.longTaskObserver?.disconnect()
    this.longTaskObserver = null
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root)
    }
    this.root = null
  }

  private buildWidget(): void {
    const root = document.createElement('div')
    root.setAttribute('data-docflow-perf-monitor', '')
    root.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:2147483000',
      'background:rgba(15,23,42,0.55)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'color:rgba(226,232,240,0.9)',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'padding:8px 10px',
      'border-radius:8px',
      'border:1px solid rgba(255,255,255,0.14)',
      'pointer-events:none',
      'user-select:none',
      'opacity:0.85',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    ].join(';')

    if (this.metrics.has('cpu')) {
      root.appendChild(this.buildRow('CPU', (el) => (this.cpuBar = el), (el) => (this.cpuValue = el)))
    }
    if (this.metrics.has('ram')) {
      root.appendChild(this.buildRow('RAM', (el) => (this.ramBar = el), (el) => (this.ramValue = el)))
    }

    this.root = root
    this.container.appendChild(root)
  }

  private buildRow(label: string, setBar: (el: HTMLElement) => void, setValue: (el: HTMLElement) => void): HTMLElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:6px;white-space:nowrap'

    const labelEl = document.createElement('span')
    labelEl.textContent = label
    labelEl.style.cssText = 'opacity:0.75;min-width:26px'

    const track = document.createElement('div')
    track.style.cssText = 'width:46px;height:5px;border-radius:3px;background:rgba(255,255,255,0.18);overflow:hidden'

    const bar = document.createElement('div')
    bar.style.cssText = 'width:0%;height:100%;border-radius:3px;background:#22d3ee;transition:width .3s ease'
    track.appendChild(bar)
    setBar(bar)

    const value = document.createElement('span')
    value.textContent = '—'
    value.style.cssText = 'min-width:64px;text-align:right'
    setValue(value)

    row.append(labelEl, track, value)
    return row
  }

  private renderBar(bar: HTMLElement | null, pct: number): void {
    if (!bar) return
    bar.style.width = `${pct}%`
    bar.style.background = pct >= 80 ? '#f87171' : pct >= 50 ? '#fbbf24' : '#22d3ee'
  }

  private onFrame = (now: number): void => {
    if (this.destroyed) return
    const delta = now - this.lastFrame
    this.lastFrame = now
    if (delta > TARGET_FRAME_MS) {
      this.busyMs += delta - TARGET_FRAME_MS
    }
    this.rafId = requestAnimationFrame(this.onFrame)
  }

  private onTick = (): void => {
    if (this.destroyed) return
    const now = performance.now()
    const windowMs = now - this.windowStart || this.interval
    this.windowStart = now

    let cpu: number | undefined
    if (this.metrics.has('cpu')) {
      cpu = Math.max(0, Math.min(100, (this.busyMs / windowMs) * 100))
      this.busyMs = 0
    }

    let ram: number | undefined
    let ramLimit: number | undefined
    if (this.metrics.has('ram')) {
      const memory = this.getMemoryInfo()
      if (memory) {
        ram = memory.usedJSHeapSize
        ramLimit = memory.jsHeapSizeLimit
      }
    }

    this.update(cpu, ram, ramLimit)
  }

  private getMemoryInfo(): MemoryInfo | null {
    const perf = performance as unknown as { memory?: MemoryInfo }
    const memory = perf.memory
    if (!memory || typeof memory.usedJSHeapSize !== 'number') return null
    return memory
  }

  private createLongTaskObserver(): PerformanceObserver | null {
    if (typeof PerformanceObserver === 'undefined') return null
    try {
      const observer = new PerformanceObserver((list) => {
        if (this.destroyed) return
        for (const entry of list.getEntries()) {
          this.busyMs += entry.duration
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
      return observer
    } catch {
      // Long Tasks API unavailable (e.g. some browsers/embedding) — the rAF
      // busy-time heuristic still covers the gap.
      return null
    }
  }
}

/** Convenience factory: creates + starts a monitor (returns a stopped one when no DOM). */
export function createPerformanceMonitor(options?: PerformanceMonitorOptions): PerformanceMonitor {
  const monitor = new PerformanceMonitor(options)
  monitor.start()
  return monitor
}
