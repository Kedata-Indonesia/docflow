import type { ChartConfiguration } from 'chart.js'

/**
 * Chart data model (issue #26).
 *
 * A chart node stores only data — never rendered pixels, except for the cached
 * `preview` PNG used by export (see `chartNode.ts`). The shape mirrors a
 * spreadsheet: shared category labels plus one or more numeric series, which
 * maps cleanly onto Chart.js and survives JSON/Yjs round-trips.
 */

export type ChartKind = 'bar' | 'column' | 'line' | 'pie'

export const CHART_KINDS: readonly ChartKind[] = ['bar', 'column', 'line', 'pie']

export interface ChartSeries {
  label: string
  values: number[]
}

export interface ChartData {
  labels: string[]
  series: ChartSeries[]
}

export const DEFAULT_CHART_DATA: ChartData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr'],
  series: [{ label: 'Series 1', values: [12, 19, 8, 15] }],
}

/** Google-Docs-ish default palette, one colour per series (or per slice). */
export const CHART_PALETTE: readonly string[] = [
  '#4285f4',
  '#ea4335',
  '#fbbc04',
  '#34a853',
  '#9334e6',
  '#ff6d01',
]

export function isChartKind(value: unknown): value is ChartKind {
  return typeof value === 'string' && (CHART_KINDS as readonly string[]).includes(value)
}

/** Serialise to the compact JSON stored in the node attribute. */
export function serializeChartData(data: ChartData): string {
  return JSON.stringify(data)
}

function isValidData(value: unknown): value is ChartData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ChartData>
  if (!Array.isArray(candidate.labels) || !Array.isArray(candidate.series)) return false
  if (!candidate.labels.every((label) => typeof label === 'string')) return false
  return candidate.series.every(
    (series) =>
      !!series &&
      typeof series.label === 'string' &&
      Array.isArray(series.values) &&
      series.values.every((n) => typeof n === 'number' && Number.isFinite(n)),
  )
}

/**
 * Parse the attribute payload. Returns `null` for anything unusable so the node
 * view can fall back to {@link DEFAULT_CHART_DATA} instead of throwing on a
 * hand-edited or legacy document.
 */
export function parseChartData(raw: unknown): ChartData | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isValidData(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** CSV round-trip for the inline data editor: header row + one row per label. */
export function chartDataToCsv(data: ChartData): string {
  const header = ['Label', ...data.series.map((series) => series.label)]
  const rows = data.labels.map((label, index) => [
    label,
    ...data.series.map((series) => String(series.values[index] ?? '')),
  ])
  return [header, ...rows].map((row) => row.join(',')).join('\n')
}

function splitRow(row: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    if (quoted) {
      if (char === '"' && row[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  return cells
}

export interface CsvParseError {
  error: string
}

/**
 * Parse the CSV shown in the data editor. The first row is a header
 * (`Label,Series 1,…`); the first column holds category labels.
 */
export function csvToChartData(csv: string): ChartData | CsvParseError {
  const rows = csv
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row !== '')
    .map(splitRow)

  if (rows.length < 2) return { error: 'Add a header row and at least one data row.' }

  const header = rows[0]
  if (header.length < 2) return { error: 'The header needs a label column and at least one series.' }

  const labels: string[] = []
  const series: ChartSeries[] = header.slice(1).map((label, index) => ({
    label: label || `Series ${index + 1}`,
    values: [],
  }))

  for (const row of rows.slice(1)) {
    if (row.length !== header.length) {
      return { error: `Row "${row[0] ?? ''}" has ${row.length} cells, expected ${header.length}.` }
    }
    labels.push(row[0])
    for (let i = 0; i < series.length; i++) {
      const raw = row[i + 1]
      const value = Number(raw)
      if (raw === '' || !Number.isFinite(value)) {
        return { error: `"${raw}" is not a number (row "${row[0]}").` }
      }
      series[i].values.push(value)
    }
  }

  return { labels, series }
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Build the Chart.js configuration for a chart node. Exported for unit tests
 * (no DOM needed) and reused by the node view.
 */
export function buildChartConfig(data: ChartData, kind: ChartKind): ChartConfiguration {
  const labels = data.labels
  const colors = data.labels.map((_, index) => CHART_PALETTE[index % CHART_PALETTE.length])

  const shared = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { display: data.series.length > 1 || kind === 'pie', position: 'bottom' as const },
    },
  }

  if (kind === 'pie') {
    return {
      type: 'pie',
      data: {
        labels,
        datasets: (data.series.length > 0 ? data.series.slice(0, 1) : []).map((series) => ({
          label: series.label,
          data: series.values,
          backgroundColor: colors,
        })),
      },
      options: shared,
    }
  }

  return {
    type: kind === 'line' ? 'line' : 'bar',
    data: {
      labels,
      datasets: data.series.map((series, index) => {
        const color = CHART_PALETTE[index % CHART_PALETTE.length]
        if (kind === 'line') {
          return {
            label: series.label,
            data: series.values,
            borderColor: color,
            backgroundColor: withAlpha(color, 0.15),
            tension: 0.3,
          }
        }
        return {
          label: series.label,
          data: series.values,
          backgroundColor: color,
        }
      }),
    },
    options: {
      ...shared,
      indexAxis: kind === 'bar' ? ('y' as const) : ('x' as const),
    },
  }
}
