import type { CslStyleInfo } from '@kedata-indonesia/docflow-plugins'

/**
 * Reference library for the citation port — CSL-JSON shaped (structurally
 * `CslItemData`). Used by the playground's custom `#references-sidebar` demo
 * (issue #22), which simulates a semantic knowledge-base search over these.
 */
export const SAMPLE_SOURCES = [
  {
    id: 'src-1',
    type: 'book',
    title: 'Information Retrieval for Business Documents',
    author: [{ family: 'Nugroho', given: 'Bambang' }],
    issued: { 'date-parts': [[2023]] },
    publisher: 'Nusantara Press',
  },
  {
    id: 'src-2',
    type: 'article-journal',
    title: 'Retrieval-Augmented Generation in Practice',
    author: [{ family: 'Prasetyo', given: 'Dimas' }],
    'container-title': 'Journal of Applied NLP',
    issued: { 'date-parts': [[2024]] },
  },
  {
    id: 'src-3',
    type: 'chapter',
    title: 'Knowledge Base Governance for Regulated Industries',
    author: [{ family: 'Indah', given: 'Sari' }],
    publisher: 'Kedata Publishing',
    issued: { 'date-parts': [[2022]] },
  },
  {
    id: 'src-4',
    type: 'report',
    title: 'Retrieval Quality Benchmarks 2026',
    author: [{ literal: 'Performance Monitoring Team' }],
    issued: { 'date-parts': [[2026]] },
  },
]

/**
 * A CSL style the *host* injects through `CitationPort.styles` (issue #180) —
 * the playground has no editor-source of its own, so a style that is not one of
 * the four the library bundles is exactly what a consumer would pass. Minimal
 * on purpose: enough CSL for citeproc to render, small enough to read.
 */
export const SAMPLE_INJECTED_STYLE: CslStyleInfo = {
  id: 'harvard-demo',
  name: 'Harvard (demo — injected by the host)',
  category: 'in-text',
  xml: [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">',
    '  <info>',
    '    <title>Harvard (demo — injected by the host)</title>',
    '    <id>harvard-demo</id>',
    '    <updated>2026-01-01T00:00:00+00:00</updated>',
    '  </info>',
    '  <citation>',
    '    <layout prefix="(" suffix=")" delimiter="; ">',
    '      <names variable="author"><name form="short"/></names>',
    '      <date prefix=" " variable="issued"><date-part name="year"/></date>',
    '      <text prefix=", " variable="locator"/>',
    '    </layout>',
    '  </citation>',
    '  <bibliography>',
    '    <layout suffix=".">',
    '      <names variable="author"><name name-as-sort-order="all"/></names>',
    '      <text prefix=" (" suffix=")" variable="title" font-style="italic"/>',
    '      <date prefix=" " variable="issued"><date-part name="year"/></date>',
    '    </layout>',
    '  </bibliography>',
    '</style>',
  ].join('\n'),
}
