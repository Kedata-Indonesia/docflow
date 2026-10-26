import type { Awareness } from 'y-protocols/awareness'

export interface AwarenessState {
  clientId: number
  user: { name: string; color: string }
  cursor?: { from: number; to: number } | null
  /**
   * Phase 9 PR2 — *present* flag. False when the local user has navigated
   * away from the editor route (the Yjs provider is still alive but the
   * host has gated cursor emission off, per the §6 *"TOC sidebar orphan
   * wiring"* / REST-heartbeat scope notes). Peers see this instantly
   * via the awareness `change` event — far faster than the 15s REST
   * heartbeat fallback. Defaults to true when the user is in the editor.
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
