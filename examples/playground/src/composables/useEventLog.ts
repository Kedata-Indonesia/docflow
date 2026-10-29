import { ref } from 'vue'
import type { LogEntry } from '../types'

/** How many events the panel keeps — the newest first. */
const MAX_EVENTS = 50

/**
 * Host-owned event log. The playground records every event `DocsEditor` emits so
 * the library's behaviour can be inspected without opening devtools.
 */
export function useEventLog() {
  const events = ref<LogEntry[]>([])
  let seq = 0

  function log(name: string, detail?: string | number, hostOwned = false): void {
    seq += 1
    const text = detail === undefined ? '' : String(detail)
    events.value = [
      { id: seq, name, detail: text, hostOwned },
      ...events.value,
    ].slice(0, MAX_EVENTS)
  }

  function clear(): void {
    events.value = []
  }

  return { events, log, clear }
}
