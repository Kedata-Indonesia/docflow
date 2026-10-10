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

// Inline footnote node (`packages/plugins/src/footnote.ts`) — `content` is the
// note body rendered inside the page's footnote area.
const fn = (content: string): PmNode => ({ type: 'footnote', attrs: { content } })
/** Paragraph built from mixed inline nodes (text + footnotes). */
const inline = (...nodes: PmNode[]): PmNode => ({ type: 'paragraph', content: nodes })
/** Ordered list from pre-built list items (each item may carry a footnote). */
const olItems = (...items: PmNode[]): PmNode => ({ type: 'orderedList', content: items })
const li = (...nodes: PmNode[]): PmNode => ({ type: 'listItem', content: [inline(...nodes)] })

// ---------------------------------------------------------------------------
// Document presets
// ---------------------------------------------------------------------------

export type PresetId = 'letter' | 'contract' | 'report' | 'long'

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

// ---------------------------------------------------------------------------
// Long, footnote-rich preset — reproduction fixture for issue #19.
//
// 13 footnotes spread through the body, plus a tall final ordered list as the
// last content block: the shape that froze `calculatePageCount` (a non-table
// last element taller than the page content area) and made every footnote pile
// onto the last page. Use it to review the pagination + footnote fixes.
// ---------------------------------------------------------------------------

const LONG_SECTIONS: Array<[string, string]> = [
  ['Executive Summary', 'Operational performance in the third quarter of 2026 improved across the primary indicators. Processing volume grew while the on-time completion rate stayed above target, and no service disruption was recorded during the period.'],
  ['Document Processing Volume', 'The team processed a larger volume than in the previous quarter, led by the verification and registration desks. Peak weeks were handled without overtime beyond the agreed ceiling, and the queue was cleared before each weekend.'],
  ['Turnaround Time', 'Average turnaround fell compared with the prior quarter across every document class. The largest improvement came from the standard verification path after the intake checklist was simplified and duplicate steps were removed.'],
  ['Quality and Accuracy', 'Sampling by the quality unit found a low error rate, with most findings classified as minor formatting issues rather than substantive mistakes. Corrective actions were closed within the same week they were raised.'],
  ['System Availability', 'Availability stayed within the service target, with only short scheduled maintenance windows. No unplanned outage affected users, and the failover drill completed well inside the recovery objective.'],
  ['Incident Review', 'Two minor incidents were logged and resolved on the same day. Both traced to configuration drift introduced during routine maintenance, and both were addressed by tightening the change-review checklist.'],
  ['Staffing and Capacity', 'Headcount was stable, with two temporary officers covering the seasonal peak. Absence stayed below plan, and the on-call rotation was adjusted so that specialist coverage was available on every working day.'],
  ['Training and Certification', 'All new staff completed the mandatory onboarding modules, and several officers renewed specialist certifications ahead of their expiry. A refresher session on handling exceptions was added at the team request.'],
  ['Vendor Coordination', 'Coordination with the technology vendor improved after a fixed weekly checkpoint was introduced. Outstanding tickets were reviewed item by item, and the vendor met the agreed response times throughout the quarter.'],
  ['Compliance and Audit', 'The internal audit found no material exceptions. Recommendations focused on documenting a small number of informal procedures and on retaining evidence for longer, both of which are already in progress.'],
  ['Customer Feedback', 'Satisfaction scores rose slightly, driven by faster turnaround and clearer status updates. The most common request was for a more detailed confirmation message once a document is completed and released.'],
  ['Risk Register', 'The register was reviewed and two entries were downgraded after mitigating controls were verified. One new risk was added, covering the dependency on a single integration point, with a monitoring plan assigned to the platform team.'],
]

const longReport = (() => {
  const blocks: PmNode[] = [
    h(1, 'Quarterly Operations Report — Q3 2026'),
    inline(
      t('Prepared by the Performance Monitoring Team · October 2026. All figures come from the internal monitoring dashboard.'),
      fn('Figures verified by the internal audit unit on 6 October 2026.'),
    ),
  ]

  LONG_SECTIONS.forEach(([heading, body], i) => {
    blocks.push(h(2, heading))
    blocks.push(
      inline(
        t(body),
        fn(`Section ${i + 1} note: supporting detail for "${heading}" is kept in the appendix register.`),
      ),
    )
  })

  blocks.push(h(2, 'Follow-up Plan'))
  blocks.push(
    olItems(
      ...Array.from({ length: 18 }, (_, i) => {
        const nodes: PmNode[] = [
          t(
            `Follow-up item ${i + 1}: complete the agreed action, record the supporting evidence, and report the outcome at the next monthly review.`,
          ),
        ]
        // Footnotes *inside* the tall final block: when pagination undercounts,
        // these refs land beyond the last page — the #19 pile-up case.
        if (i % 2 === 0) {
          nodes.push(
            fn(`Appendix note ${i + 1}: supporting evidence for item ${i + 1} is filed in the appendix register.`),
          )
        }
        return li(...nodes)
      }),
    ),
  )

  return doc(...blocks)
})()

export const PRESETS: Record<PresetId, Preset> = {
  letter: { title: 'Invitation to the Q4 Coordination Meeting', doc: letter },
  contract: { title: 'Software Services Cooperation Agreement', doc: contract },
  report: { title: 'Monthly Performance Report — September 2026', doc: report },
  long: { title: 'Quarterly Operations Report — Q3 2026', doc: longReport },
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
