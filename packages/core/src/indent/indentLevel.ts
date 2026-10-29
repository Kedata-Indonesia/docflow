import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** One indent step — half an inch, matching Google Docs (48px at 96dpi). */
export const INDENT_STEP_PX = 48

/** Deepest block indent the commands accept (8 × 48px = 384px). */
export const INDENT_MAX_LEVEL = 8

/** Backing node attribute; rendered as `data-indent` so it round-trips. */
export const INDENT_ATTR = 'indent'

/** DOM attribute the level is serialized to (also read back on paste). */
export const INDENT_DATA_ATTR = 'data-indent'

/** Custom property the editor stylesheet turns into `margin-left`. */
export const INDENT_STYLE_VAR = '--docflow-indent'

/** Custom property carrying the step size, so the stylesheet has no 48px copy. */
export const INDENT_STEP_VAR = '--docflow-indent-step'

/** Block types that carry the indent attribute. */
export const INDENTABLE_NODES: readonly string[] = ['paragraph', 'heading']

/** List containers whose items nest through Tab instead of block indent. */
export const LIST_ITEM_NODES: readonly string[] = ['listItem', 'taskItem']

export const CODE_BLOCK = 'codeBlock'

/** Absolute CSS length units → px at 96dpi (the unit `margin-left` may arrive in). */
const ABSOLUTE_UNIT_PX: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
}

/** Clamp any input to a valid indent level (0 … INDENT_MAX_LEVEL). */
export function clampIndentLevel(level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.min(Math.max(Math.trunc(level), 0), INDENT_MAX_LEVEL)
}

/** Indent level stored on a block node (`0` when the attribute is absent). */
export function indentLevelOf(node: ProseMirrorNode): number {
  return clampIndentLevel(Number(node.attrs[INDENT_ATTR] ?? 0))
}

/**
 * Resolve `element.style.marginLeft` to px. `CSSStyleDeclaration` returns the
 * *specified* value (`0.5in`, `108pt`), not a computed one, so the unit has to
 * be converted explicitly. Relative units are ignored (0) — there is no layout
 * box at parse time to resolve them against.
 */
function marginLeftPx(element: Element): number {
  const raw = (element as HTMLElement).style?.marginLeft?.trim() ?? ''
  if (!raw) return 0
  const match = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i.exec(raw)
  if (!match) return 0
  const value = Number.parseFloat(match[1])
  const unit = (match[2] || 'px').toLowerCase()
  const factor = ABSOLUTE_UNIT_PX[unit]
  return factor === undefined ? 0 : value * factor
}

/**
 * Read the level out of parsed HTML. `data-indent` is preferred (that is what
 * this extension renders). `margin-left` is the fallback for content loaded
 * through `createEditor({ content })` — stored/imported HTML that already has an
 * inline offset. It does not fire on paste: `pasteNormalization` keeps only
 * `color`/`background-color` from `style` and drops `margin-left` before
 * ProseMirror parses the clipboard.
 */
export function parseIndentLevel(element: Element): number {
  const raw = element.getAttribute(INDENT_DATA_ATTR)
  if (raw !== null) return clampIndentLevel(Number.parseInt(raw, 10))

  const px = marginLeftPx(element)
  return Number.isFinite(px) && px > 0 ? clampIndentLevel(Math.round(px / INDENT_STEP_PX)) : 0
}

/** DOM attributes rendered for a block at `level`. */
export function renderIndentAttributes(level: number): Record<string, string> {
  return {
    [INDENT_DATA_ATTR]: String(level),
    // Three representations on purpose: the custom properties let the
    // stylesheet out-rank its own `!important` block-margin shorthands (see
    // packages/vue/src/styles/index.css) and keep the step size in one place,
    // while the inline `margin-left` still works for hosts that do not ship
    // that stylesheet.
    style: `${INDENT_STYLE_VAR}: ${level}; ${INDENT_STEP_VAR}: ${INDENT_STEP_PX}px; margin-left: ${level * INDENT_STEP_PX}px`,
  }
}
