import { createNodeFromContent, type Editor } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { Selection, type Transaction } from '@tiptap/pm/state'
import { type EditorView } from '@tiptap/pm/view'
import { ReplaceAroundStep, ReplaceStep } from '@tiptap/pm/transform'

/**
 * Markdown → ProseMirror insert helpers for the AI writing paths.
 *
 * Problem this solves: the AI chat sidebar (`AISidebar.handleInsert`) and the
 * inline `/ai` accept (`aiAccept`) used to call `tr.insertText(turn.text, …)`
 * / `state.schema.text(preview.text)`. Both primitives treat the string as
 * opaque characters, so a streamed `| Task | Description |` markdown table
 * landed as literal pipe text instead of a `table` node — even though the
 * Table extension (and the whole schema for headings/lists/bold/…) was
 * already registered.
 *
 * The bridge is the `tiptap-markdown` package's `Markdown` extension (added to
 * `aiPlugin.tiptapExtensions`): it puts a `MarkdownParser` on
 * `editor.storage.markdown.parser` whose `parse(md, { inline })` runs
 * markdown-it → HTML, after which TipTap's schema-aware DOMParser turns the
 * HTML into ProseMirror nodes (tables included). We can't reuse the
 * extension's overridden `insertContentAt` command because it FORCES
 * `inline: true` (wrong for block content like tables), so these helpers call
 * `createNodeFromContent` + `tr.replaceWith` directly — mirroring TipTap's
 * native `insertContentAt` minus the inline-parse override, and keeping the
 * existing direct-`view.dispatch` discipline (one substantive transaction per
 * Insert, so Yjs sees a single human-style edit).
 *
 * Graceful fallback: when the `Markdown` extension isn't registered (a host
 * that drops `aiPlugin`, or a stripped build), these return null / fall back
 * to `insertText`, preserving the pre-markdown plain-text behavior.
 */

/** Storage shape the `tiptap-markdown` `Markdown` extension puts on `editor.storage.markdown`. */
interface MarkdownParserLike {
  /** Returns an HTML string rendered from the markdown via markdown-it. */
  parse(content: string, opts?: { inline?: boolean }): unknown
}

function mdParser(editor: Editor): MarkdownParserLike | undefined {
  const storage = (editor.storage as Record<string, unknown>).markdown
  if (!storage || typeof storage !== 'object') return undefined
  const parser = (storage as { parser?: unknown }).parser
  if (!parser || typeof parser !== 'object' || !('parse' in parser)) return undefined
  return parser as MarkdownParserLike
}

/**
 * Parse a markdown string into a ProseMirror `Fragment` using the editor's
 * live schema.
 *
 * - `inline: false` keeps BLOCK structure (tables, lists, headings) — for the
 *   chat sidebar Insert, where a streamed answer may contain a table.
 * - `inline: true` unwraps the leading paragraph so the result is inline
 *   content — for the inline `/ai` transform, which replaces an in-paragraph
 *   selection range.
 *
 * Returns `null` when the `tiptap-markdown` `Markdown` extension isn't
 * registered; callers MUST fall back to `schema.text(md)` to keep the
 * pre-markdown behavior.
 */
export function markdownToFragment(
  editor: Editor,
  markdown: string,
  opts: { inline: boolean },
): Fragment | null {
  const parser = mdParser(editor)
  if (!parser) return null
  let html: unknown
  try {
    html = parser.parse(markdown, { inline: opts.inline })
  } catch {
    // Defensive: a malformed markdown-it plugin shouldn't crash Insert.
    return null
  }
  if (typeof html !== 'string') return null
  // createNodeFromContent with slice:true runs DOMParser.fromSchema(schema)
  // .parseSlice(...) — schema-aware, so <table> becomes the registered
  // table/tableRow/tableHeader/tableCell nodes. Same path as TipTap's native
  // insertContentAt for HTML strings.
  const content = createNodeFromContent(html, editor.schema, {
    slice: true,
    parseOptions: { preserveWhitespace: 'full' },
  })
  if (content instanceof Fragment) return content
  return Fragment.from(content as PMNode)
}

/**
 * Move the selection to the end of the just-inserted content (the same
 * helper TipTap's native `insertContentAt` calls), so the cursor lands right
 * after the inserted table/list/heading instead of staying at the old anchor.
 */
function selectionToInsertionEnd(tr: Transaction, startLen: number, bias: number): void {
  const last = tr.steps.length - 1
  if (last < startLen) return
  const step = tr.steps[last]
  if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep)) return
  const map = tr.mapping.maps[last]
  let end = 0
  map.forEach((_from, _to, _newFrom, newTo) => {
    if (end === 0) end = newTo
  })
  tr.setSelection(Selection.near(tr.doc.resolve(end), bias))
}

/**
 * Insert BLOCK markdown at the range `[from, to)` in ONE dispatch, dispatching
 * directly on `view` (NOT via `editor.commands`) so the Markdown extension's
 * forced-inline `insertContentAt` override is bypassed and a table survives.
 *
 * Mirrors TipTap's native `insertContentAt` for HTML strings:
 *   1. parse markdown → HTML → schema Fragment (block-preserving),
 *   2. if the range is collapsed inside an EMPTY paragraph AND the fragment is
 *      all block nodes, expand the range by one on each side so the empty
 *      paragraph is REPLACED by the block content (no nested-in-paragraph
 *      block, no leftover empty line),
 *   3. plain-text fast path keeps current marks (rare for markdown, but
 *      matches `insertText` semantics for pure-prose turns),
 *   4. `tr.replaceWith` (ProseMirror's `replaceStep` splits the parent as
 *      needed so a block fits at an inline position),
 *   5. move the selection to the end of the inserted content.
 *
 * Falls back to `tr.insertText(md, from, to)` when the Markdown extension
 * isn't registered — preserving the pre-markdown plain-text Insert so the
 * feature degrades gracefully.
 */
export function insertMarkdownBlock(
  editor: Editor,
  view: EditorView,
  from: number,
  to: number,
  markdown: string,
): void {
  const fragment = markdownToFragment(editor, markdown, { inline: false })
  if (!fragment) {
    view.dispatch(view.state.tr.insertText(markdown, from, to))
    return
  }
  const tr = view.state.tr

  // Empty-paragraph replacement (mirror native insertContentAt): only when
  // the range is collapsed, the fragment is all blocks, and the parent is an
  // empty textblock — replace it instead of nesting.
  let f = from
  let t = to
  if (f === t) {
    let onlyBlock = true
    fragment.forEach((n) => {
      if (!n.isBlock) onlyBlock = false
    })
    if (onlyBlock) {
      const $pos = tr.doc.resolve(f)
      const parent = $pos.parent
      if (parent.isTextblock && !parent.type.spec.code && !parent.childCount) {
        f -= 1
        t += 1
      }
    }
  }

  // Plain-text fast path — preserves active marks (matches insertText).
  let onlyText = true
  fragment.forEach((n) => {
    if (!n.isText || n.marks.length > 0) onlyText = false
  })
  if (onlyText) {
    let text = ''
    fragment.forEach((n) => {
      if (n.isText) text += n.text ?? ''
    })
    tr.insertText(text, f, t)
  } else {
    tr.replaceWith(f, t, fragment)
  }

  selectionToInsertionEnd(tr, 0, -1)
  view.dispatch(tr)
}