/**
 * citeproc-js emits a small, fixed set of formatting tags (<i>, <sup>,
 * <span style="font-variant:small-caps;">, plus its <div class="csl-entry">
 * bibliography wrapper). Allow exactly those, escape everything else —
 * source metadata is user input and must never become active markup.
 */
const FORMATTING_TAG =
  /^<\/?(i|b|em|strong|sup|sub|span|nobr)( style="font-variant: ?small-caps;?")?\/?>$/
const BIBLIOGRAPHY_WRAPPER = /^(<div class="csl-entry">|<\/div>)$/

/** True only for markup citeproc itself emits; everything else is escaped. */
function isCiteprocTag(tag: string): boolean {
  return FORMATTING_TAG.test(tag) || BIBLIOGRAPHY_WRAPPER.test(tag)
}

export function sanitizeCiteprocHtml(html: string): string {
  return html.replace(/<[^>]*>/g, (tag) =>
    isCiteprocTag(tag) ? tag : tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  )
}
