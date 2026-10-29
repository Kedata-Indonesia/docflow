import { doc, h, lead, ol, p, quote } from '../pm'

/** Services agreement — exercises headings, ordered lists and blockquotes. */
export const contractDoc = doc(
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
  p(
    'This agreement is valid for a period of 24 months from the date of signing and may be extended by written agreement of both parties.',
  ),
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
