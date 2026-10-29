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
 *
 * The pieces live in `suggest/`: `suggestTypes.ts` (names, state, plugin key),
 * `suggestMarks.ts` (the three marks), `suggestRuns.ts` (run ids + range
 * scanning), `suggestCapture.ts` (typing/paste/delete), `suggestFormatChanges.ts`
 * (bold/italic/… → format proposals), `suggestQueries.ts` (`getSuggestions`) and
 * `suggestResolve.ts` (accept/reject). This file stays the extension manifest.
 */
import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { definePlugin, type DocumentMode } from '@kedata-indonesia/docflow-core'
import { captureDeleteKey, capturePaste, captureTextInput } from './suggest/suggestCapture.js'
import { buildFormatSuggestionTr } from './suggest/suggestFormatChanges.js'
import {
  SuggestionDeleteMark,
  SuggestionFormatMark,
  SuggestionInsertMark,
} from './suggest/suggestMarks.js'
import { getSuggestions } from './suggest/suggestQueries.js'
import {
  SUGGESTION_DELETE,
  SUGGESTION_FORMAT,
  SUGGESTION_INSERT,
  suggestChangesKey,
  type SuggestionAuthor,
  type SuggestionSummary,
  type SuggestState,
} from './suggest/suggestTypes.js'
import {
  acceptAllSuggestions,
  acceptSuggestion,
  buildResolveTr,
  rejectAllSuggestions,
  rejectSuggestion,
} from './suggest/suggestResolve.js'

export { SUGGESTION_DELETE, SUGGESTION_FORMAT, SUGGESTION_INSERT, suggestChangesKey }
export type { SuggestionAuthor, SuggestionSummary }
export { SuggestionDeleteMark, SuggestionFormatMark, SuggestionInsertMark }
export { getSuggestions }
export { acceptAllSuggestions, acceptSuggestion, rejectAllSuggestions, rejectSuggestion }

const SuggestChanges = Extension.create({
  name: 'suggestChanges',
  addStorage() {
    // Live list of pending suggestions, kept in sync by the plugin's view (P2
    // review UI reads it). Data-only: the editor instance isn't available here.
    return { suggestions: [] as SuggestionSummary[] }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    const syncStorage = () => {
      const storage = (editor.storage as unknown as Record<string, { suggestions?: SuggestionSummary[] }>)
        .suggestChanges
      if (storage) storage.suggestions = getSuggestions(editor)
    }
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
        view: () => {
          syncStorage()
          return { update: syncStorage }
        },
        appendTransaction: (transactions, _oldState, newState) =>
          buildFormatSuggestionTr(transactions, newState),
        props: {
          handleTextInput: captureTextInput,
          handleKeyDown: captureDeleteKey,
          handlePaste: (view, _event, slice) => capturePaste(view, slice),
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

export const suggestChangesPlugin = definePlugin({
  id: 'suggestChanges',
  tiptapExtensions: [SuggestionInsertMark, SuggestionDeleteMark, SuggestionFormatMark, SuggestChanges],
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
