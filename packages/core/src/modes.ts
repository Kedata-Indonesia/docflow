/**
 * Document editing modes (issues #27 / #28 — suggesting mode + track changes).
 *
 * - `editing`    — normal editing (default).
 * - `suggesting` — edits are recorded as suggestion marks instead of applied.
 * - `viewing`    — read-only; the editor is not editable.
 *
 * Hosts own *authorisation* (who may suggest / accept). The library only
 * provides the mode behaviour and the commands; see
 * `docs/plans/suggesting-mode-and-track-changes.md`.
 */
export type DocumentMode = 'editing' | 'suggesting' | 'viewing'

/** Every document mode, in menu order. */
export const DOCUMENT_MODES: readonly DocumentMode[] = ['editing', 'suggesting', 'viewing']
