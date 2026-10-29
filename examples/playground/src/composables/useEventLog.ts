import { ref } from 'vue'
import type { LogEntry } from '../types'

/** Keep the panel readable — the log is a demo surface, not an audit trail. */
const MAX_ENTRIES = 50

/**
 * Append-only event log shown in the review rail. Every editor event the host
 * observes lands here, newest first.
 */
export function useEventLog() {
  const events = ref<LogEntry[]>([])
  let eventSeq = 0

  function log(name: string, detail?: string | number, hostOwned = false): void {
    eventSeq += 1
    const text = detail === undefined ? '' : String(detail)
    events.value = [{ id: eventSeq, name, detail: text, hostOwned }, ...events.value].slice(
      0,
      MAX_ENTRIES,
    )
  }

  function clear(): void {
    events.value = []
  }

  return { events, log, clear }
}
