import { doc, p, type PmDoc } from '../pm'
import { contractDoc } from './contract'
import { letterDoc } from './letter'
import { longReportDoc } from './longReport'
import { reportDoc } from './report'

export type PresetId = 'blank' | 'letter' | 'contract' | 'report' | 'long'

export interface Preset {
  title: string
  doc: PmDoc
}

export const PRESETS: Record<PresetId, Preset> = {
  blank: { title: 'Blank document', doc: doc(p('')) },
  letter: { title: 'Invitation to the Q4 Coordination Meeting', doc: letterDoc },
  contract: { title: 'Software Services Cooperation Agreement', doc: contractDoc },
  report: { title: 'Monthly Performance Report — September 2026', doc: reportDoc },
  long: { title: 'Quarterly Operations Report — Q3 2026', doc: longReportDoc },
}

export const PAGE_SIZE_OPTIONS = [
  { id: 'a4', label: 'A4 — 210 × 297 mm' },
  { id: 'f4', label: 'F4 / Folio — 215 × 330 mm' },
  { id: 'letter', label: 'Letter — 216 × 279 mm' },
  { id: 'legal', label: 'Legal — 216 × 356 mm' },
  { id: 'a5', label: 'A5 — 148 × 210 mm' },
] as const
