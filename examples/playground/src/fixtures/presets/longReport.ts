import { doc, fn, h, inline, li, olItems, t, type PmNode } from '../pm'

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

export const longReportDoc = (() => {
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
