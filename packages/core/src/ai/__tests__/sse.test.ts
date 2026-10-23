import { describe, expect, it } from 'vitest'
import { takeSseEvent } from '../sse.js'

describe('takeSseEvent', () => {
  it('returns null until the buffer holds a complete event', () => {
    expect(takeSseEvent('data: {"a":1}')).toBeNull()
    expect(takeSseEvent('data: {"a":1}\n')).toBeNull()
  })

  it('splits LF-terminated events and keeps the remainder', () => {
    const event = takeSseEvent('data: first\n\ndata: second\n\n')
    expect(event).toEqual({ data: 'first', rest: 'data: second\n\n' })
  })

  it('splits CRLF-terminated events', () => {
    const event = takeSseEvent('event: delta\r\ndata: {"a":1}\r\n\r\nrest')
    expect(event).toEqual({ data: '{"a":1}', rest: 'rest' })
  })

  it('joins multi-line data fields with a newline', () => {
    const event = takeSseEvent('data: {\ndata:   "a": 1\ndata: }\n\n')
    expect(event?.data).toBe('{\n  "a": 1\n}')
  })

  it('strips only one optional space after the colon', () => {
    expect(takeSseEvent('data:  two-spaces\n\n')?.data).toBe(' two-spaces')
    expect(takeSseEvent('data:none\n\n')?.data).toBe('none')
  })

  it('returns a null payload for events without data fields', () => {
    expect(takeSseEvent(': keep-alive\n\n')).toEqual({ data: null, rest: '' })
    expect(takeSseEvent('event: ping\n\n')?.data).toBeNull()
  })

  it('handles a separator split across network chunks once rejoined', () => {
    // The caller appends the next chunk before retrying.
    expect(takeSseEvent('data: x\r')).toBeNull()
    expect(takeSseEvent('data: x\r\n\r\n')?.data).toBe('x')
  })
})
