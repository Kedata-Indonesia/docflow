import type { Awareness } from 'y-protocols/awareness'

/**
 * Phase 9 PR2 — the cursor-emission gate.
 *
 * The reference implementation lived inline in `createCollaboration` and mixed
 * three concerns: reading the option, mutating two awareness fields, and
 * suppressing redundant publishes. This module owns just the gate so the
 * factory reads as wiring.
 *
 * The gate is published as its own awareness field (`emitCursor`) so peers and
 * `isLocalCursorEnabled()` can read it without a parallel copy. `present` is
 * intentionally NOT tied to this gate: tab visibility changes call it on every
 * hidden tab, and flipping `present` here made peers' avatars flash off
 * (Phase 9 PR2 regression). The real "left the doc" signal is unmount →
 * `destroy()` → `setLocalState(null)`, which propagates in one round-trip.
 */
export interface CursorGate {
  /** Flip the gate. No-op when the value is unchanged. */
  setEnabled: (enabled: boolean) => void
  /** Current gate value; `true` unless explicitly disabled (legacy-safe). */
  isEnabled: () => boolean
}

export function createCursorGate(awareness: Awareness, initial: boolean): CursorGate {
  let enabled = initial
  awareness.setLocalStateField('emitCursor', enabled)

  return {
    isEnabled: () => awareness.getLocalState()?.emitCursor !== false,
    setEnabled: (next: boolean) => {
      if (enabled === next) return
      enabled = next
      // When leaving: clear the cursor so peers don't paint a phantom one.
      // When returning: leave the cursor field alone — the CollaborationCursor
      // extension repopulates it on the next selection change.
      if (!next) {
        awareness.setLocalStateField('cursor', null)
      }
      awareness.setLocalStateField('emitCursor', next)
    },
  }
}
