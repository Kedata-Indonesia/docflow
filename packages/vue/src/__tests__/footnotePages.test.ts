/**
 * `assignFootnotePages` — penempatan badan footnote ke halaman.
 *
 * Kasus pentingnya nyata (docflow #248): saat pagination belum mencakup seluruh
 * dokumen, ref di ekor dokumen berada di luar halaman terakhir. Dulu semuanya
 * ditempel ke halaman terakhir — 13 footnote menumpuk di halaman 6 padahal
 * teksnya sepanjang ~12 halaman. Sekarang ref seperti itu dilaporkan sebagai
 * `deferred` supaya pemanggil bisa mencoba lagi setelah pagination tumbuh.
 *
 * Geometri di bawah meniru dokumen nyata: pitch 978px dengan area break setinggi
 * 286px di bawah setiap halaman (halaman pertama mulai di 1036).
 */
import { describe, expect, it } from 'vitest'

import { assignFootnotePages, DEFERRED_PAGE } from '../utils/footnotePages.js'

const TOPS = [1036, 2014, 2992]
const BOTTOMS = [1322, 2300, 3278]

describe('assignFootnotePages', () => {
  it('menempatkan ref pada halaman tempat break area-nya dimulai di bawah ref', () => {
    // Semantik lama dipertahankan: ref di atas break area halaman pertama → halaman 0.
    const { pages, deferred } = assignFootnotePages([500, 1200, 2500], TOPS, BOTTOMS)
    expect(pages).toEqual([0, 1, 2])
    expect(deferred).toBe(0)
  })

  it('ref di dalam halaman terakhir tetap di halaman terakhir', () => {
    const { pages, deferred } = assignFootnotePages([3000, 3278], TOPS, BOTTOMS)
    expect(pages).toEqual([2, 2])
    expect(deferred).toBe(0)
  })

  // Regresi bug halaman 6: ref di luar halaman terakhir tidak ditempel ke
  // halaman terakhir, tetapi ditandai untuk dicoba ulang setelah pagination tumbuh.
  it('ref di luar halaman terakhir ditandai deferred, bukan ditempel ke halaman terakhir', () => {
    const { pages, deferred } = assignFootnotePages([500, 9003, 9207], TOPS, BOTTOMS)
    expect(pages).toEqual([0, DEFERRED_PAGE, DEFERRED_PAGE])
    expect(deferred).toBe(2)
  })

  it('tanpa halaman sama sekali: semuanya deferred', () => {
    const { pages, deferred } = assignFootnotePages([10, 20], [], [])
    expect(pages).toEqual([DEFERRED_PAGE, DEFERRED_PAGE])
    expect(deferred).toBe(2)
  })

  it('satu halaman saja: ref di dalamnya masuk halaman itu, di luarnya deferred', () => {
    const { pages, deferred } = assignFootnotePages([500, 5000], [1036], [1322])
    expect(pages).toEqual([0, DEFERRED_PAGE])
    expect(deferred).toBe(1)
  })

  it('urutan hasil mengikuti urutan ref', () => {
    const { pages } = assignFootnotePages([5000, 500, 2500], TOPS, BOTTOMS)
    expect(pages).toEqual([DEFERRED_PAGE, 0, 2])
  })
})
