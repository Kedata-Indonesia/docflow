import { Extension, type Editor } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /** Shift the block(s) in the selection one level right (Tab). */
      indent: () => ReturnType
      /** Shift the block(s) in the selection one level left (Shift-Tab). */
      outdent: () => ReturnType
      /** Set an absolute block-indent level (clamped to INDENT_MAX_LEVEL). */
      setIndent: (level: number) => ReturnType
      /** Reset the block indent of every block in the selection. */
      unsetIndent: () => ReturnType
    }
  }
}

/** One indent step — half an inch, matching Google Docs (48px at 96dpi). */
export const INDENT_STEP_PX = 48

/** Deepest block indent the commands accept (8 × 48px = 384px). */
export const INDENT_MAX_LEVEL = 8

/** Backing node attribute; rendered as `data-indent` so it round-trips. */
const INDENT_ATTR = 'indent'

/** DOM attribute the level is serialized to (also read back on paste). */
const INDENT_DATA_ATTR = 'data-indent'

const INDENTABLE_NODES: readonly string[] = ['paragraph', 'heading']
const LIST_ITEM_NODES: readonly string[] = ['listItem', 'taskItem']
const CODE_BLOCK = 'codeBlock'

/** Absolute CSS length units → px at 96dpi (the unit `margin-left` may arrive in). */
const ABSOLUTE_UNIT_PX: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
}

/**
 * TipTap's command `dispatch` ignores its argument and commits the `tr` handed
 * to the command, so every mutation below has to happen on that transaction.
 */
type Dispatch = (() => void) | undefined

/** Only the slice of TipTap's command props this extension needs. */
interface IndentProps {
  editor: Editor
  state: EditorState
  tr: Transaction
  dispatch: Dispatch
  commands: {
    sinkListItem: (typeOrName: string) => boolean
    liftListItem: (typeOrName: string) => boolean
  }
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
 * Read the level out of parsed HTML. `data-indent` is preferred (that is what
 * this extension renders). `margin-left` is the fallback for content loaded
 * through `createEditor({ content })` — stored/imported HTML that already has an
 * inline offset. It does not fire on paste: `pasteNormalization` keeps only
 * `color`/`background-color` from `style` and drops `margin-left` before
 * ProseMirror parses the clipboard.
 */
function parseIndentLevel(element: Element): number {
  const raw = element.getAttribute(INDENT_DATA_ATTR)
  if (raw !== null) return clampIndentLevel(Number.parseInt(raw, 10))

  const px = marginLeftPx(element)
  return Number.isFinite(px) && px > 0 ? clampIndentLevel(Math.round(px / INDENT_STEP_PX)) : 0
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

/** Custom property the editor stylesheet turns into `margin-left`. */
export const INDENT_STYLE_VAR = '--docflow-indent'

/** Custom property carrying the step size, so the stylesheet has no 48px copy. */
export const INDENT_STEP_VAR = '--docflow-indent-step'

function renderIndentAttributes(level: number): Record<string, string> {
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

/** Shift every indentable block touched by the selection by `delta` levels. */
function shiftBlockIndent(props: IndentProps, delta: number): boolean {
  const { state, tr } = props
  const { from, to } = state.selection
  let changed = false

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!INDENTABLE_NODES.includes(node.type.name)) return
    const current = indentLevelOf(node)
    const next = clampIndentLevel(current + delta)
    if (next === current) return
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [INDENT_ATTR]: next })
    changed = true
  })

  if (changed) props.dispatch?.()
  return changed
}

/** Offsets (inside the code block text) where each covered line starts. */
function coveredCodeLineStarts(state: EditorState): number[] | null {
  const { $from, $to } = state.selection
  if ($from.parent.type.name !== CODE_BLOCK || !$from.sameParent($to)) return null

  const text = $from.parent.textContent
  const first = text.lastIndexOf('\n', Math.max($from.parentOffset - 1, 0)) + 1
  const breakAt = text.indexOf('\n', $to.parentOffset)
  const end = breakAt === -1 ? text.length : breakAt

  const starts: number[] = []
  for (let at = first; at <= end; at++) {
    if (at === first || text[at - 1] === '\n') starts.push(at)
  }
  return starts
}

/** One leading tab, or up to two leading spaces (soft-tab round-trip). */
const LEADING_INDENT = /^(?:\t| {1,2})/

/**
 * Tab inside a code block edits literal whitespace instead of the outline: a
 * collapsed cursor gets a tab at the caret, a multi-line selection gains (or
 * loses) one leading tab per covered line. Returns false when the selection
 * does not sit inside a single code block.
 */
function shiftCodeBlockIndent(props: IndentProps, delta: 1 | -1): boolean {
  const starts = coveredCodeLineStarts(props.state)
  if (!starts) return false

  // Collapsed selection: insert at the caret, like an editor's Tab, instead of
  // jumping the edit to column 0 of the line.
  if (delta > 0 && props.state.selection.empty) {
    props.tr.insertText('\t')
    props.dispatch?.()
    return true
  }

  const text = props.state.selection.$from.parent.textContent
  const blockStart = props.state.selection.$from.start()
  const { tr } = props

  // Walk right-to-left so earlier offsets stay valid while inserting/deleting.
  for (let i = starts.length - 1; i >= 0; i--) {
    const at = blockStart + starts[i]
    if (delta > 0) {
      tr.insertText('\t', at, at)
      continue
    }
    const leading = LEADING_INDENT.exec(text.slice(starts[i]))?.[0]
    if (leading) tr.delete(at, at + leading.length)
  }

  const changed = delta > 0 || tr.docChanged
  if (changed) props.dispatch?.()
  return changed
}

/**
 * Tab / Shift-Tab resolution order (Google Docs behaviour): code block →
 * literal whitespace, list → nest/unnest, otherwise → block indent. Levels are
 * clamped, so Tab is a no-op at the extremes.
 */
function runIndent(props: IndentProps, delta: 1 | -1): boolean {
  if (props.editor.isActive(CODE_BLOCK)) return shiftCodeBlockIndent(props, delta)

  const listItem = LIST_ITEM_NODES.find((name) => props.editor.isActive(name))
  if (listItem) {
    const nested =
      delta > 0
        ? props.commands.sinkListItem(listItem)
        : props.commands.liftListItem(listItem)
    // A first-level item cannot sink any deeper — fall through, so Tab still
    // indents its text instead of dead-ending.
    if (nested) return true
  }

  return shiftBlockIndent(props, delta)
}

/**
 * Issue #189 (second round): with the caret at the very start of an indented block,
 * Backspace/Delete must step the block out one level instead of deleting content —
 * Google Docs behaviour. Before this the only way back was Shift-Tab, and pressing
 * Backspace at the start of an indented paragraph left the indent behind.
 *
 * Only blocks carrying the `indent` attribute are affected: code blocks keep their
 * literal indentation and list items un-nest through the list keymap.
 */
function outdentAtBlockStart(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return false
  if (editor.isActive(CODE_BLOCK)) return false

  const { $from } = selection
  if ($from.parentOffset > 0) return false
  if (!INDENTABLE_NODES.includes($from.parent.type.name)) return false
  if (indentLevelOf($from.parent) <= 0) return false

  return editor.commands.outdent()
}

/**
 * IndentExtension — keyboard block indentation for the docs editor.
 *
 * Issue #189: Tab used to leave the editor because nothing bound it. The
 * extension stores the level as a node attribute on paragraphs/headings,
 * renders it as `data-indent` + `margin-left`, and exposes
 * `indent` / `outdent` / `setIndent` / `unsetIndent` so the toolbar menu can
 * offer the same commands as the keyboard.
 *
 * Priority is deliberately BELOW the 100 default: Tab is already claimed by
 * richer contexts (`@tiptap/extension-list-item` nesting, table cell
 * navigation, the AI suggestion preview) and those must keep precedence. This
 * extension only runs once they have declined the key — paragraphs/headings,
 * and the first item of a list that cannot nest any deeper.
 */
export const IndentExtension = Extension.create({
  name: 'indent',
  priority: 50,

  addGlobalAttributes() {
    return [
      {
        types: [...INDENTABLE_NODES],
        attributes: {
          [INDENT_ATTR]: {
            default: 0,
            parseHTML: parseIndentLevel,
            renderHTML: (attributes) => {
              const level = clampIndentLevel(Number(attributes[INDENT_ATTR] ?? 0))
              return level > 0 ? renderIndentAttributes(level) : {}
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent: () => (props) => runIndent(props, 1),

      outdent: () => (props) => runIndent(props, -1),

      setIndent:
        (level: number) =>
        ({ state, tr, dispatch }) => {
          const target = clampIndentLevel(level)
          const { from, to } = state.selection
          let changed = false

          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!INDENTABLE_NODES.includes(node.type.name)) return
            if (indentLevelOf(node) === target) return
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, [INDENT_ATTR]: target })
            changed = true
          })

          if (changed) dispatch?.()
          return changed
        },

      unsetIndent: () => ({ commands }) => commands.setIndent(0),
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    }
  },
})

/**
 * Backspace/Delete outdent (#189, second round).
 *
 * A separate extension on purpose: `IndentExtension` declares `priority: 50` so Tab
 * yields to list nesting, table cell navigation and the AI preview, and a keymap at
 * that priority never sees Backspace at all — `baseKeymap` (priority 100) consumes it
 * first. This extension only claims Backspace/Delete, so it can sit above the base
 * keymap without taking Tab away from anyone.
 */
export const IndentBackspaceExtension = Extension.create({
  name: 'indentBackspace',
  priority: 150,

  addKeyboardShortcuts() {
    const outdent = () => outdentAtBlockStart(this.editor)
    return {
      Backspace: outdent,
      Delete: outdent,
    }
  },
})
