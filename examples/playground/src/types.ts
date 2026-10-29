/** Signature of the event-log writer shared by the playground composables. */
export type LogFn = (name: string, detail?: string | number, hostOwned?: boolean) => void

/** One line in the playground event log. */
export interface LogEntry {
  id: number
  name: string
  detail: string
  /**
   * Issue #153 — the emitted action belongs to the host, so the playground only
   * logs it (see `HOST_OWNED_ACTIONS`). Rendered as a visible tag, matching the
   * dimmed "host" marker on the header menu items.
   */
  hostOwned?: boolean
}
