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

  it('supports CR-only line endings and double-CR separators', () => {
    const event = takeSseEvent('data: a\rdata: b\r\r')
    expect(event).toEqual({ data: 'a\nb', rest: '' })
  })

  it('supports multi-line CR-only streams forming complete JSON', () => {
    const event = takeSseEvent('data: {\rdata:   "a": 1\rdata: }\r\r')
    expect(event?.data).toBe('{\n  "a": 1\n}')
  })

  it('handles a CRLF separator truncated to \\r\\n\\r followed by \\n safely', () => {
    // Truncated chunk ending with \r\n\r followed by \n in the next chunk
    // As per the issue: "bila separator CRLF terpotong tepat setelah 3 dari 4 byte (\r\n\r), regex menganggap event selesai karena \r dihitung sebagai terminator. Ini aman — payload sudah lengkap di titik itu, dan sisa \n di chunk berikutnya menjadi baris kosong di awal block yang diabaikan."
    const chunk1 = 'data: first\r\n\r\n'
    const event1 = takeSseEvent(chunk1)
    expect(event1?.data).toBe('first')
    const buffer2 = '\n' + 'data: second\r\n\r\n'
    const event2 = takeSseEvent(buffer2)
    expect(event2?.data).toBe('second')
  })
})
