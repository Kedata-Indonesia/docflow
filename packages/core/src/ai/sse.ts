/**
 * Server-Sent Events framing shared by the AI providers (issues #384, #398).
 *
 * Providers used to split on `'\n\n'` and feed each `data:` line to
 * `JSON.parse` on its own. Both assumptions are wrong for spec-compliant
 * servers: SSE allows LF, CRLF, or a lone CR as line terminators, and one event
 * may carry several `data:` lines that must be joined with `'\n'` before
 * parsing.
 */

export interface SseEvent {
  /**
   * Payload of the event — the event's `data:` lines joined with `'\n'`, with
   * a single optional space after the colon removed. `null` when the event has
   * no `data:` field (comments, keep-alives, `event:`/`id:` only).
   */
  data: string | null
  /** Remaining buffer after the event separator. */
  rest: string
}

/**
 * Consume one complete SSE event from the start of `buffer`.
 *
 * Returns `null` while the buffer holds no event separator yet, so callers can
 * keep reading network chunks.
 */
export function takeSseEvent(buffer: string): SseEvent | null {
  // `\r(?!\n)` keeps CRLF from matching as two separate terminators when the
  // regex backtracks, and `\r\n` first keeps a CRLF split across chunks from
  // being read as one.
  const separator = /(?:\r\n|\r(?!\n)|\n){2}/.exec(buffer)
  if (!separator) return null

  const block = buffer.slice(0, separator.index)
  const data: string[] = []
  for (const line of block.split(/\r\n|\r|\n/)) {
    if (!line.startsWith('data:')) continue
    const value = line.slice('data:'.length)
    data.push(value.startsWith(' ') ? value.slice(1) : value)
  }

  return {
    data: data.length > 0 ? data.join('\n') : null,
    rest: buffer.slice(separator.index + separator[0].length),
  }
}
