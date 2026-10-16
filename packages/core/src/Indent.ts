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
 * this extension renders); `margin-left` is the fallback so indented text from
 * Google Docs / Word keeps its offset — CSSOM already normalized it to px.
 */
function parseIndentLevel(element: Element): number {
  const raw = element.getAttribute(INDENT_DATA_ATTR)
  if (raw !== null) return clampIndentLevel(Number.parseInt(raw, 10))
  const px = Number.parseFloat((element as HTMLElement).style.marginLeft)
  return Number.isFinite(px) && px > 0 ? clampIndentLevel(Math.round(px / INDENT_STEP_PX)) : 0
}

/** Custom property the editor stylesheet turns into `margin-left`. */
export const INDENT_STYLE_VAR = '--docflow-indent'

function renderIndentAttributes(level: number): Record<string, string> {
  return {
    [INDENT_DATA_ATTR]: String(level),
    // Two representations on purpose: the custom property lets the stylesheet
    // out-rank its own `!important` block-margin shorthands (see
    // packages/vue/src/styles/index.css), while the inline `margin-left` still
    // works for hosts that do not ship that stylesheet.
    style: `${INDENT_STYLE_VAR}: ${level}; margin-left: ${level * INDENT_STEP_PX}px`,
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
 * Tab inside a code block edits literal whitespace instead of the outline: the
 * covered lines gain (or lose) one leading tab. Returns false when the
 * selection does not sit inside a single code block.
 */
function shiftCodeBlockIndent(props: IndentProps, delta: 1 | -1): boolean {
  const starts = coveredCodeLineStarts(props.state)
  if (!starts) return false

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
