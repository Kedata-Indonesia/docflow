import { doc, h, lead, ol, p, ul } from '../pm'

/** Formal invitation letter — the default preset. */
export const letterDoc = doc(
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
  p('This concludes our invitation. Thank you for your attention and cooperation.'),
  p(''),
  p('Sincerely,'),
  p(''),
  lead('Rani Prameswari'),
  p('Director of Operations'),
)
