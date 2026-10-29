import { AddMarkStep, RemoveMarkStep } from '@tiptap/pm/transform'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { markAttrs, newSuggestionId } from './suggestRuns.js'
import {
  FORMAT_MARKS,
  SUGGESTION_FORMAT,
  SUGGEST_APPLIED_META,
  suggestChangesKey,
} from './suggestTypes.js'

/**
 * P3: capture bold/italic/underline/strike/highlight changes as format
 * suggestions instead of applying them.
 *
 * Runs from `appendTransaction`, so it sees the user's transaction after the
 * fact: every captured step is reverted and a `suggestionFormat` mark records
 * the proposal. Returns `null` when there is nothing to capture.
 */
export function buildFormatSuggestionTr(
  transactions: readonly Transaction[],
  newState: EditorState,
): Transaction | null {
  // Ignore our own appended transactions and anything not in suggesting mode.
  if (transactions.some((tr) => tr.getMeta(SUGGEST_APPLIED_META))) return null
  const current = suggestChangesKey.getState(newState)
  if (current?.mode !== 'suggesting') return null

  const formatMark = newState.schema.marks[SUGGESTION_FORMAT]
  if (!formatMark) return null

  const changes: Array<{ from: number; to: number; name: string; add: boolean }> = []
  for (const tr of transactions) {
    for (const step of tr.steps) {
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
        if (!FORMAT_MARKS.has(step.mark.type.name)) continue
        changes.push({
          from: step.from,
          to: step.to,
          name: step.mark.type.name,
          add: step instanceof AddMarkStep,
        })
      }
    }
  }
  if (changes.length === 0) return null

  const tr = newState.tr
  for (const change of changes) {
    const target = newState.schema.marks[change.name]
    if (!target) continue
    // Revert the applied format change, then record the proposal.
    if (change.add) tr.removeMark(change.from, change.to, target)
    else tr.addMark(change.from, change.to, target.create())
    tr.addMark(
      change.from,
      change.to,
      formatMark.create({
        ...markAttrs(newSuggestionId(), current.author),
        format: change.name,
        delta: change.add ? 'add' : 'remove',
      }),
    )
  }
  tr.setMeta(SUGGEST_APPLIED_META, true)
  return tr
}
