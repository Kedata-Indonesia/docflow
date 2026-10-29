import type { Awareness } from 'y-protocols/awareness'

export interface AwarenessState {
  clientId: number
  user: { name: string; color: string }
  cursor?: { from: number; to: number } | null
  /**
   * Phase 9 PR2 — presence marker.
   *
   * It is `true` for every peer that still holds an awareness state, and a
   * peer that leaves disappears from the list entirely (`destroy()` →
   * `setLocalState(null)`), so this never reads `false` in practice. Kept for
   * backwards compatibility with consumers that read it — treat "state is
   * absent from the array" as the real leave signal.
   */
  present: boolean
}

interface AwarenessRawState {
  user?: { name: string; color: string }
  cursor?: { from: number; to: number } | null
  /** Phase 9 PR2 — see AwarenessState.present. Defaults to true when not
   *  explicitly set (legacy states that only carry `user` + `cursor`). */
  present?: boolean
}

const LOCAL_PRESENT_DEFAULT = true

export function createAwarenessStates(awareness: Awareness): AwarenessState[] {
  const states: AwarenessState[] = []
  awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
    const raw = state as AwarenessRawState
    states.push({
      clientId,
      user: raw.user ?? { name: '', color: '' },
      cursor: raw.cursor ?? null,
      // `present` defaults to true for backwards compat (legacy states
      // don't set it) and for the local user (always considered present
      // until PR2 toggles it off).
      present: raw.present ?? LOCAL_PRESENT_DEFAULT,
    })
  })
  return states
}
