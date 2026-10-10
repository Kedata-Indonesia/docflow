/**
 * Suggesting mode + track changes (issues #27 / #28, P1).
 *
 * Two marks carry proposals **inside the document** — exactly like the comment
 * mark — so suggestions ride the Yjs doc: they are collaborative for free and
 * need no server collection. See
 * `docs/plans/suggesting-mode-and-track-changes.md`.
 *
 *   suggestionInsert  — text that would be added
 *   suggestionDelete  — text that would be removed
 *
 * P1 captures genuine user input (typing, paste, backspace/delete) only, so
 * programmatic writes (AI streaming, collaboration echoes, host commands) are
 * never mis-tagged. Accepted/rejected suggestions become ordinary undoable,
 * collaborative transactions.
 *
 * Known P1 gap: IME composition is not captured (typing/paste/delete are). The
 * design doc tracks it as a follow-up.
 */
import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import type { Node as PMNode, Slice } from '@tiptap/pm/model'
import { definePlugin, type DocumentMode } from '@kedata-indonesia/docflow-core'

export const SUGGESTION_INSERT = 'suggestionInsert'
export const SUGGESTION_DELETE = 'suggestionDelete'

export interface SuggestionAuthor {
  id?: string | null
  name?: string | null
}

export interface SuggestionSummary {
  id: string
  type: 'insert' | 'delete'
  authorId: string | null
  authorName: string | null
  from: number
  to: number
}

interface SuggestState {
  mode: DocumentMode
  author: SuggestionAuthor
}

export const suggestChangesKey = new PluginKey<SuggestState>('suggestChanges')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestChanges: {
      /** Switch the document mode (editing / suggesting / viewing). */
      setDocumentMode: (mode: DocumentMode) => ReturnType
      /** Set the author recorded on new suggestions. */
      setSuggestionAuthor: (author: SuggestionAuthor) => ReturnType
      /** Accept one suggestion (keep insertions, drop deletions). */
      acceptSuggestion: (id: string) => ReturnType
      /** Reject one suggestion (drop insertions, keep deletions). */
      rejectSuggestion: (id: string) => ReturnType
      /** Accept every pending suggestion. */
      acceptAllSuggestions: () => ReturnType
      /** Reject every pending suggestion. */
      rejectAllSuggestions: () => ReturnType
    }
  }
}

const suggestionAttributes = () => ({
  suggestionId: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion-id'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.suggestionId ? { 'data-suggestion-id': attrs.suggestionId } : {},
  },
  authorId: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion-author'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.authorId ? { 'data-suggestion-author': attrs.authorId } : {},
  },
  authorName: { default: null },
  createdAt: { default: null },
})

export const SuggestionInsertMark = Mark.create({
  name: SUGGESTION_INSERT,
  addAttributes() {
    return suggestionAttributes()
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="insert"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-suggestion': 'insert',
        class: 'docflow-suggestion docflow-suggestion--insert',
      }),
      0,
    ]
  },
})

export const SuggestionDeleteMark = Mark.create({
  name: SUGGESTION_DELETE,
  addAttributes() {
    return suggestionAttributes()
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="delete"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-suggestion': 'delete',
        class: 'docflow-suggestion docflow-suggestion--delete',
      }),
      0,
    ]
  },
})

// A fresh id per suggestion "run" (a typed word, a pasted block, a deletion).
let suggestionSeq = 0
const newSuggestionId = (): string => {
  suggestionSeq += 1
  return `sug-${Date.now().toString(36)}-${suggestionSeq.toString(36)}`
}

/** Id of an adjacent suggestion run (so consecutive edits group into one). */
const adjacentRunId = (editorState: EditorState, pos: number, markName: string): string | null => {
  if (pos <= 0) return null
  const before = editorState.doc.resolve(pos).nodeBefore
  if (!before || !before.isText) return null
  const mark = before.marks.find((m) => m.type.name === markName)
  return (mark?.attrs.suggestionId as string | undefined) ?? null
}

const markAttrs = (id: string, author: SuggestionAuthor) => ({
  suggestionId: id,
  authorId: author.id ?? null,
  authorName: author.name ?? null,
  createdAt: Date.now(),
})

/** Collect contiguous ranges carrying `markName` (optionally a single id). */
const collectRanges = (
  doc: PMNode,
  markName: string,
  id?: string,
): Array<{ from: number; to: number }> => {
  const out: Array<{ from: number; to: number }> = []
  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.length === 0) return
    for (const mark of node.marks) {
      if (mark.type.name !== markName) continue
      if (id && mark.attrs.suggestionId !== id) continue
      out.push({ from: pos, to: pos + node.nodeSize })
    }
  })
  return out
}

const SuggestChanges = Extension.create({
  name: 'suggestChanges',
  addProseMirrorPlugins() {
    return [
      new Plugin<SuggestState>({
        key: suggestChangesKey,
        state: {
          init: () => ({ mode: 'editing', author: {} }),
          apply: (tr, value) => {
            const meta = tr.getMeta(suggestChangesKey) as Partial<SuggestState> | undefined
            if (!meta) return value
            return {
              mode: meta.mode ?? value.mode,
              author: meta.author ?? value.author,
            }
          },
        },
        props: {
          handleTextInput: (view, from, to, text) => {
            const current = suggestChangesKey.getState(view.state)
            if (current?.mode !== 'suggesting' || !text) return false
            const insert = view.state.schema.marks[SUGGESTION_INSERT]
            const del = view.state.schema.marks[SUGGESTION_DELETE]
            if (!insert || !del) return false

            const id = adjacentRunId(view.state, from, SUGGESTION_INSERT) ?? newSuggestionId()
            const tr = view.state.tr
            // A replacement keeps the old text, marked as a deletion.
            if (to > from) tr.addMark(from, to, del.create(markAttrs(id, current.author)))
            const insertAt = to
            tr.insertText(text, insertAt, insertAt)
            tr.addMark(insertAt, insertAt + text.length, insert.create(markAttrs(id, current.author)))
            view.dispatch(tr)
            return true
          },
          handleKeyDown: (view, event) => {
            const current = suggestChangesKey.getState(view.state)
            if (current?.mode !== 'suggesting') return false
            if (event.key !== 'Backspace' && event.key !== 'Delete') return false

            const del = view.state.schema.marks[SUGGESTION_DELETE]
            if (!del) return false
            const { selection, doc } = view.state
            let from: number
            let to: number
            if (!selection.empty) {
              from = selection.from
              to = selection.to
            } else if (event.key === 'Backspace') {
              if (selection.from <= 1) return false
              from = selection.from - 1
              to = selection.from
            } else {
              if (selection.to >= doc.content.size - 1) return false
              from = selection.to
              to = selection.to + 1
            }

            const id = adjacentRunId(view.state, from, SUGGESTION_DELETE) ?? newSuggestionId()
            const tr = view.state.tr.addMark(from, to, del.create(markAttrs(id, current.author)))
            if (event.key === 'Backspace' && selection.empty) {
              tr.setSelection(TextSelection.create(tr.doc, from))
            }
            view.dispatch(tr)
            return true
          },
          handlePaste: (view, _event, slice: Slice) => {
            const current = suggestChangesKey.getState(view.state)
            if (current?.mode !== 'suggesting') return false
            const insert = view.state.schema.marks[SUGGESTION_INSERT]
            const del = view.state.schema.marks[SUGGESTION_DELETE]
            if (!insert || !del) return false

            const { from, to } = view.state.selection
            const id = adjacentRunId(view.state, from, SUGGESTION_INSERT) ?? newSuggestionId()
            const tr = view.state.tr
            if (to > from) tr.addMark(from, to, del.create(markAttrs(id, current.author)))
            const insertAt = to
            tr.insert(insertAt, slice.content)
            tr.addMark(insertAt, insertAt + slice.content.size, insert.create(markAttrs(id, current.author)))
            view.dispatch(tr)
            return true
          },
        },
      }),
    ]
  },
  addCommands() {
    return {
      setDocumentMode:
        (mode: DocumentMode) =>
        ({ state, dispatch }): boolean => {
          if (!dispatch) return false
          dispatch(state.tr.setMeta(suggestChangesKey, { mode }))
          return true
        },
      setSuggestionAuthor:
        (author: SuggestionAuthor) =>
        ({ state, dispatch }): boolean => {
          if (!dispatch) return false
          dispatch(state.tr.setMeta(suggestChangesKey, { author }))
          return true
        },
      acceptSuggestion:
        (id: string) =>
        ({ state, dispatch }): boolean => {
          const tr = buildResolveTr(state, true, id)
          if (!tr || !dispatch) return false
          dispatch(tr)
          return true
        },
      rejectSuggestion:
        (id: string) =>
        ({ state, dispatch }): boolean => {
          const tr = buildResolveTr(state, false, id)
          if (!tr || !dispatch) return false
          dispatch(tr)
          return true
        },
      acceptAllSuggestions:
        () =>
        ({ state, dispatch }): boolean => {
          const tr = buildResolveTr(state, true)
          if (!tr || !dispatch) return false
          dispatch(tr)
          return true
        },
      rejectAllSuggestions:
        () =>
        ({ state, dispatch }): boolean => {
          const tr = buildResolveTr(state, false)
          if (!tr || !dispatch) return false
          dispatch(tr)
          return true
        },
    }
  },
})

function editorDispatch(editor: Editor, meta: Partial<SuggestState>) {
  editor.view.dispatch(editor.state.tr.setMeta(suggestChangesKey, meta))
}

// ─── Public command functions (also exposed through pluginActions) ──────────

export function setDocumentMode(editor: Editor, mode: DocumentMode): boolean {
  editorDispatch(editor, { mode })
  return true
}

export function setSuggestionAuthor(editor: Editor, author: SuggestionAuthor): boolean {
  editorDispatch(editor, { author })
  return true
}

/** All pending suggestions, ordered by position. */
export function getSuggestions(editor: Editor): SuggestionSummary[] {
  const byId = new Map<string, SuggestionSummary>()
  const scan = (markName: string, type: 'insert' | 'delete') => {
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      for (const mark of node.marks) {
        if (mark.type.name !== markName) continue
        const id = mark.attrs.suggestionId as string
        const existing = byId.get(id)
        if (existing) {
          existing.from = Math.min(existing.from, pos)
          existing.to = Math.max(existing.to, pos + node.nodeSize)
        } else {
          byId.set(id, {
            id,
            type,
            authorId: (mark.attrs.authorId as string | null) ?? null,
            authorName: (mark.attrs.authorName as string | null) ?? null,
            from: pos,
            to: pos + node.nodeSize,
          })
        }
      }
    })
  }
  scan(SUGGESTION_INSERT, 'insert')
  scan(SUGGESTION_DELETE, 'delete')
  return [...byId.values()].sort((a, b) => a.from - b.from)
}

/** Build the accept/reject transaction over `state` (or null when unchanged). */
function buildResolveTr(state: EditorState, accept: boolean, id?: string) {
  const { schema } = state
  const insertMark = schema.marks[SUGGESTION_INSERT]
  const deleteMark = schema.marks[SUGGESTION_DELETE]
  if (!insertMark || !deleteMark) return null

  const insertRanges = collectRanges(state.doc, SUGGESTION_INSERT, id)
  const deleteRanges = collectRanges(state.doc, SUGGESTION_DELETE, id)
  if (insertRanges.length === 0 && deleteRanges.length === 0) return null

  // Accept: keep insertions, drop deletions. Reject: the inverse.
  const rangesToUnmark = accept ? insertRanges : deleteRanges
  const markToRemove = accept ? insertMark : deleteMark
  const rangesToDelete = accept ? deleteRanges : insertRanges

  const tr = state.tr
  for (const range of rangesToUnmark) {
    tr.removeMark(range.from, range.to, markToRemove)
  }
  // Delete from the end so earlier positions stay valid.
  for (const range of [...rangesToDelete].sort((a, b) => b.from - a.from)) {
    tr.delete(range.from, range.to)
  }
  return tr.docChanged ? tr : null
}

/** Apply `accept`/`reject` for one suggestion (or all when `id` is omitted). */
function resolveSuggestions(editor: Editor, accept: boolean, id?: string): boolean {
  const tr = buildResolveTr(editor.state, accept, id)
  if (!tr) return false
  editor.view.dispatch(tr)
  return true
}

export const acceptSuggestion = (editor: Editor, id: string): boolean =>
  resolveSuggestions(editor, true, id)
export const rejectSuggestion = (editor: Editor, id: string): boolean =>
  resolveSuggestions(editor, false, id)
export const acceptAllSuggestions = (editor: Editor): boolean => resolveSuggestions(editor, true)
export const rejectAllSuggestions = (editor: Editor): boolean => resolveSuggestions(editor, false)

export const suggestChangesPlugin = definePlugin({
  id: 'suggestChanges',
  tiptapExtensions: [SuggestionInsertMark, SuggestionDeleteMark, SuggestChanges],
  commands: {
    setDocumentMode: (editor, ...args) => setDocumentMode(editor, args[0] as DocumentMode),
    setSuggestionAuthor: (editor, ...args) =>
      setSuggestionAuthor(editor, (args[0] as SuggestionAuthor) ?? {}),
    acceptSuggestion: (editor, ...args) => acceptSuggestion(editor, args[0] as string),
    rejectSuggestion: (editor, ...args) => rejectSuggestion(editor, args[0] as string),
    acceptAllSuggestions: editor => acceptAllSuggestions(editor),
    rejectAllSuggestions: editor => rejectAllSuggestions(editor),
  },
})
