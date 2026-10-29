/**
 * citeproc-js emits a small, fixed set of formatting tags (<i>, <sup>,
 * <span style="font-variant:small-caps;">, plus its <div class="csl-entry">
 * bibliography wrapper). Allow exactly those, escape everything else —
 * source metadata is user input and must never become active markup.
 */
const CITEPROC_TAG = /^<\/?(i|b|em|strong|sup|sub|span|nobr)( style="font-variant: ?small-caps;?")?\/?>$|^<div class="csl-entry">$|^<\/div>$/

export function sanitizeCiteprocHtml(html: string): string {
  return html.replace(
    /<[^>]*>/g,
    (tag) => (CITEPROC_TAG.test(tag) ? tag : tag.replace(/</g, '&lt;').replace(/>/g, '&gt;')),
  )
}
