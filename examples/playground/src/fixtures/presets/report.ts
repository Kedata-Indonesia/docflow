import { doc, h, lead, ol, p, quote, ul } from '../pm'

/** Monthly performance report — a normal multi-page-ish body. */
export const reportDoc = doc(
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
