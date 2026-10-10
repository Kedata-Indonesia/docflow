/**
 * Sample data for the playground — the "host app" side of the contract.
 *
 * Everything here is what a real consumer would feed the library: a ProseMirror
 * document, comment threads, version snapshots and collaborators. The library
 * never fetches this data itself (see docs/LIBRARY_CONTRACT.md).
 */

import type { Collaborator, CommentItem, DocumentSnapshot } from '@kedata-indonesia/docflow-vue'

// ---------------------------------------------------------------------------
// ProseMirror document helpers
// ---------------------------------------------------------------------------

export interface PmMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface PmNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  text?: string
  marks?: PmMark[]
}

export interface PmDoc {
  type: 'doc'
  content: PmNode[]
}

const t = (text: string, marks?: PmMark[]): PmNode => (marks ? { type: 'text', text, marks } : { type: 'text', text })
const bold = (text: string): PmNode => t(text, [{ type: 'bold' }])

const h = (level: number, text: string): PmNode => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const p = (text: string): PmNode => ({ type: 'paragraph', content: text ? [t(text)] : [] })
const lead = (text: string): PmNode => ({ type: 'paragraph', content: [bold(text)] })
const ul = (...items: string[]): PmNode => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
})
const ol = (...items: string[]): PmNode => ({
  type: 'orderedList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
})
const quote = (text: string): PmNode => ({ type: 'blockquote', content: [p(text)] })
const doc = (...blocks: PmNode[]): PmDoc => ({ type: 'doc', content: blocks })

// ---------------------------------------------------------------------------
// Document presets
// ---------------------------------------------------------------------------

export type PresetId = 'letter' | 'contract' | 'report'

export interface Preset {
  title: string
  doc: PmDoc
}

const letter = doc(
  h(1, 'Nusantara Cakrawala Ltd.'),
  p('45 Merdeka Street, Bandung 40115 · (022) 555-0147 · hello@nusantaracakrawala.co.id'),
  p(''),
  p('Bandung, 7 October 2026'),
  p('Reference: 214/NC/X/2026'),
  p('Subject: Invitation to the Q4 Coordination Meeting'),
  p(''),
  p('To the Head of the Operations Division'),
  p('at your office'),
  p(''),
  p('Dear Sir/Madam,'),
  p(
    'Following the close of the third quarter of fiscal year 2026, we invite you to attend a coordination meeting with the following agenda.',
  ),
  ol(
    'Review of Q3 performance and deviations from the corporate work plan targets.',
    'Reconciliation of financial statements and internal audit findings.',
    'Preparation of the Q4 work plan and budget requirements.',
    'Definition of additional performance indicators for the customer service function.',
  ),
  p(''),
  lead('Time and place'),
  ul(
    'Day/Date: Monday, 12 October 2026',
    'Time: 09:00 – 12:00 WIB',
    'Venue: Main Meeting Room, 8th Floor, Nusantara Building',
    'Online: the link will be shared by email one day in advance',
  ),
  p(''),
  p(
    'Given the importance of this agenda, we look forward to your punctual attendance together with each unit\u2019s presentation materials, submitted no later than Friday, 9 October 2026 at 15:00 WIB.',
  ),
  p(
    'This concludes our invitation. Thank you for your attention and cooperation.',
  ),
  p(''),
  p('Sincerely,'),
  p(''),
  lead('Rani Prameswari'),
  p('Director of Operations'),
)

const contract = doc(
  h(1, 'Software Services Cooperation Agreement'),
  p('Reference: 088/PKS/X/2026'),
  p(''),
  lead('The Parties'),
  p(
    'This agreement is made and signed on Wednesday, 7 October 2026, by and between the following parties.',
  ),
  ol(
    'Nusantara Cakrawala Ltd., domiciled in Bandung, represented by Rani Prameswari as Director of Operations, hereinafter referred to as the FIRST PARTY.',
    'Sinar Teknologi Mandiri Ltd., domiciled in Jakarta, represented by Bagas Wicaksana as Chief Executive Officer, hereinafter referred to as the SECOND PARTY.',
  ),
  p(''),
  lead('Article 1 — Scope'),
  p(
    'The SECOND PARTY shall provide development, maintenance, and technical support services for the document management software described in Appendix I, which forms an integral part of this agreement.',
  ),
  lead('Article 2 — Term'),
  p('This agreement is valid for a period of 24 months from the date of signing and may be extended by written agreement of both parties.'),
  lead('Article 3 — Value and Payment Terms'),
  ol(
    'The contract value is agreed at IDR 1,480,000,000, excluding taxes.',
    'Payment is made quarterly based on the work acceptance report.',
    'Late payment incurs a penalty of 1 percent per month on the outstanding invoice amount.',
  ),
  lead('Article 4 — Confidentiality'),
  p(
    'Both parties shall keep confidential all technical and commercial information obtained during the performance of this agreement, including after its termination.',
  ),
  lead('Article 5 — Force Majeure'),
  quote(
    'In the event of force majeure beyond the control of the parties, the affected obligations shall be temporarily suspended without giving rise to any claim for compensation.',
  ),
  lead('Article 6 — Dispute Resolution'),
  p(
    'Any dispute arising shall first be settled amicably. If no resolution is reached within 30 days, the parties agree to settle through the Indonesian National Board of Arbitration.',
  ),
  p(''),
  p('This agreement is made in duplicate, each copy having equal legal force.'),
)

const report = doc(
  h(1, 'Monthly Performance Report — September 2026'),
  p('Unit: Operations Directorate · Prepared by: Performance Monitoring Team'),
  p(''),
  lead('Executive Summary'),
  p(
    'Operational performance in September 2026 showed improvement across all key indicators. Average processing time dropped to 2.4 days from 3.1 days the previous month.',
  ),
  lead('Key Indicators'),
  ul(
    'Documents processed: 12,480 files, up 8.2 percent from August.',
    'On-time completion rate: 94.6 percent, exceeding the 92 percent target.',
    'Customer complaint rate: 0.7 percent of all transactions, down from 1.1 percent.',
    'System availability: 99.94 percent with two minor incidents and no service disruption.',
  ),
  lead('Challenges'),
  ol(
    'Document verification backlog in the third week due to national holidays and collective leave.',
    'Data synchronization between the legacy and new systems is not yet fully automated.',
  ),
  lead('Follow-up Plan'),
  ul(
    'Add two temporary verification officers for the October and December peak periods.',
    'Complete the second phase of database integration by the end of November.',
    'Draft updated incident response procedures together with the technology team.',
  ),
  quote(
    'Note: all figures in this report come from the internal monitoring dashboard and were verified by the audit unit on 3 October 2026.',
  ),
)

export const PRESETS: Record<PresetId, Preset> = {
  letter: { title: 'Invitation to the Q4 Coordination Meeting', doc: letter },
  contract: { title: 'Software Services Cooperation Agreement', doc: contract },
  report: { title: 'Monthly Performance Report — September 2026', doc: report },
}

export const PAGE_SIZE_OPTIONS = [
  { id: 'a4', label: 'A4 — 210 × 297 mm' },
  { id: 'f4', label: 'F4 / Folio — 215 × 330 mm' },
  { id: 'letter', label: 'Letter — 216 × 279 mm' },
  { id: 'legal', label: 'Legal — 216 × 356 mm' },
  { id: 'a5', label: 'A5 — 148 × 210 mm' },
] as const

// ---------------------------------------------------------------------------
// Host-owned side data (comments, versions, collaborators)
// ---------------------------------------------------------------------------

export const SAMPLE_COMMENTS: CommentItem[] = [
  {
    id: 'thread-1',
    authorId: 'user-2',
    authorName: 'Dimas Prasetyo',
    authorColor: '#2563eb',
    content: 'The reference number needs to match this year\u2019s agenda book.',
    anchorText: 'Reference: 214/NC/X/2026',
    createdAt: Date.now() - 7_200_000,
    replies: [
      {
        id: 'reply-1',
        authorId: 'user-1',
        authorName: 'Reviewer DocFlow',
        authorColor: '#059669',
        content: 'Checked with the secretariat — this number is correct.',
        createdAt: Date.now() - 3_600_000,
      },
    ],
  },
  {
    id: 'thread-2',
    authorId: 'user-3',
    authorName: 'Sari Indah',
    authorColor: '#d97706',
    content: 'Add the online link so out-of-town participants can join.',
    createdAt: Date.now() - 86_400_000,
    resolved: true,
    resolvedBy: 'Dimas Prasetyo',
    replies: [],
  },
  {
    id: 'thread-3',
    authorId: 'user-1',
    authorName: 'Reviewer DocFlow',
    authorColor: '#059669',
    content: 'The deadline for submitting presentation materials should be emphasized in a separate bullet.',
    createdAt: Date.now() - 172_800_000,
    replies: [],
  },
]

export const SAMPLE_SNAPSHOTS: DocumentSnapshot[] = [
  {
    versionId: 'ver-3',
    versionIndex: 3,
    title: 'Final revision — ready for signature',
    contentPreview: 'This agreement is made and signed on Wednesday, 7 October 2026…',
    modifiedBy: 'Reviewer DocFlow',
    timestamp: Date.now() - 1_800_000,
  },
  {
    versionId: 'ver-2',
    versionIndex: 2,
    title: 'Revision of Article 3',
    contentPreview: 'The contract value is agreed at IDR 1,480,000,000, excluding taxes…',
    modifiedBy: 'Dimas Prasetyo',
    timestamp: Date.now() - 43_200_000,
  },
  {
    versionId: 'ver-1',
    versionIndex: 1,
    title: 'First draft',
    contentPreview: 'The SECOND PARTY shall provide development, maintenance, and support…',
    modifiedBy: 'Sari Indah',
    timestamp: Date.now() - 259_200_000,
  },
]

export const SAMPLE_COLLABORATORS: Collaborator[] = [
  { userId: 'user-2', name: 'Dimas Prasetyo', color: '#2563eb' },
  { userId: 'user-3', name: 'Sari Indah', color: '#d97706', isTyping: true },
  { userId: 'user-4', name: 'Bagas Wicaksana', color: '#7c3aed' },
]
