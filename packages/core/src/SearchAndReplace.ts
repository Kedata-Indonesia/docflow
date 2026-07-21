import { Extension, type Editor as TiptapEditor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Find & Replace — core editing infrastructure (always registered, like
 * TextStyle). Plain-string, case-insensitive search with ProseMirror
 * decorations for match highlighting. No regex (deliberate — see the
 * edit-menu plan §5.6).
 */

export interface SearchMatch {
  from: number
  to: number
}

export interface SearchState {
  query: string
  matches: SearchMatch[]
  activeIndex: number
}

export const searchAndReplaceKey = new PluginKey<SearchState>('searchAndReplace')

const EMPTY_STATE: SearchState = { query: '', matches: [], activeIndex: 0 }

/**
 * Case-insensitive plain-string search across all text nodes.
 * Matches are **non-overlapping** (the scan advances by the needle length) so
 * replace-all can apply them in one transaction without position drift.
 */
export function findMatches(doc: PMNode, query: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  if (!query) return matches
  const needle = query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const hay = node.text.toLowerCase()
    let idx = hay.indexOf(needle)
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + needle.length })
      idx = hay.indexOf(needle, idx + needle.length)
    }
  })
  return matches
}

function clampIndex(index: number, matches: SearchMatch[]): number {
  if (matches.length === 0) return 0
  return Math.min(Math.max(index, 0), matches.length - 1)
}

function computeState(doc: PMNode, query: string, activeIndex = 0): SearchState {
  const matches = findMatches(doc, query)
  return { query, matches, activeIndex: clampIndex(activeIndex, matches) }
}

type SearchMeta =
  | { type: 'set'; query: string }
  | { type: 'clear' }
  | { type: 'setActive'; index: number }

const searchPlugin = new Plugin<SearchState>({
  key: searchAndReplaceKey,

  state: {
    init: () => EMPTY_STATE,
    apply: (tr, prev) => {
      const meta = tr.getMeta(searchAndReplaceKey) as SearchMeta | undefined
      if (meta) {
        if (meta.type === 'clear') return EMPTY_STATE
        if (meta.type === 'set') return computeState(tr.doc, meta.query)
        return { ...prev, activeIndex: clampIndex(meta.index, prev.matches) }
      }
      // Keep match positions correct while the user edits with a search open.
      if (tr.docChanged && prev.query) {
        return computeState(tr.doc, prev.query, prev.activeIndex)
      }
      return prev
    },
  },

  props: {
    decorations: (state) => {
      const s = searchAndReplaceKey.getState(state)
      if (!s || s.matches.length === 0) return null
      return DecorationSet.create(
        state.doc,
        s.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class: i === s.activeIndex ? 'find-match find-match-active' : 'find-match',
          }),
        ),
      )
    },
  },
})

export const SearchAndReplaceExtension = Extension.create({
  name: 'searchAndReplace',

  addProseMirrorPlugins() {
    return [searchPlugin]
  },
})

// ─── Host/dialog-facing API ──────────────────────────────────────────────────

export function getSearchState(editor: TiptapEditor): SearchState {
  return searchAndReplaceKey.getState(editor.state) ?? EMPTY_STATE
}

export function setSearchQuery(editor: TiptapEditor, query: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(searchAndReplaceKey, { type: 'set', query } as SearchMeta))
}

export function clearSearch(editor: TiptapEditor): void {
  editor.view.dispatch(editor.state.tr.setMeta(searchAndReplaceKey, { type: 'clear' } as SearchMeta))
}

function activateMatch(editor: TiptapEditor, index: number): void {
  const s = getSearchState(editor)
  const match = s.matches[index]
  const tr = editor.state.tr.setMeta(searchAndReplaceKey, { type: 'setActive', index } as SearchMeta)
  if (match) {
    // Select the match so replace acts on it visibly, and scroll it into view.
    tr.setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
    tr.scrollIntoView()
  }
  editor.view.dispatch(tr)
}

/** Move to the next match (wraps). Returns the newly active match, if any. */
export function searchNext(editor: TiptapEditor): SearchMatch | null {
  const s = getSearchState(editor)
  if (s.matches.length === 0) return null
  const next = (s.activeIndex + 1) % s.matches.length
  activateMatch(editor, next)
  return s.matches[next]
}

/** Move to the previous match (wraps). Returns the newly active match, if any. */
export function searchPrev(editor: TiptapEditor): SearchMatch | null {
  const s = getSearchState(editor)
  if (s.matches.length === 0) return null
  const prev = (s.activeIndex - 1 + s.matches.length) % s.matches.length
  activateMatch(editor, prev)
  return s.matches[prev]
}

/** Replace the active match. The doc change recomputes matches automatically. */
export function replaceCurrent(editor: TiptapEditor, replacement: string): boolean {
  const s = getSearchState(editor)
  const match = s.matches[s.activeIndex]
  if (!match) return false
  editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to))
  return true
}

/** Replace every match in one transaction (applied back-to-front). */
export function replaceAll(editor: TiptapEditor, replacement: string): number {
  const s = getSearchState(editor)
  if (s.matches.length === 0) return 0
  const tr = editor.state.tr
  for (let i = s.matches.length - 1; i >= 0; i--) {
    tr.insertText(replacement, s.matches[i].from, s.matches[i].to)
  }
  editor.view.dispatch(tr)
  return s.matches.length
}
