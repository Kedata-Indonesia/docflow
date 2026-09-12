import { describe, expect, it } from 'vitest'

import { grownPageCount, MAX_PAGES } from '../pagination/pageCount.js'

// Satu halaman A4 dengan margin/header/footer AKTIF AI: area konten 692px.
const PAGE_AREA = 692

describe('grownPageCount', () => {
  it('menambah halaman sebanyak overflow yang diukur', () => {
    // Dokumen NA nyata: 1.478px overflow → 3 halaman tambahan.
    expect(
      grownPageCount({
        currentPageCount: 6,
        lastPageGap: 1478,
        pageContentAreaHeight: PAGE_AREA,
        maxPagesByContent: 12,
      }),
    ).toBe(9)
  })

  // Regresi: dulu blok terakhir yang lebih tinggi dari satu halaman (mis. <ol>
  // 774px vs area 692px, bukan tabel yang bisa dipecah) membekukan pertambahan
  // halaman — dokumen berhenti di 6 halaman dan semua footnote menumpuk di
  // halaman terakhir. Blok panjang memang butuh halaman tambahan.
  it('blok terakhir yang lebih tinggi dari area konten tidak lagi membekukan', () => {
    const grown = grownPageCount({
      currentPageCount: 6,
      lastPageGap: 774,
      pageContentAreaHeight: PAGE_AREA,
      maxPagesByContent: 8,
    })
    expect(grown).toBeGreaterThan(6)
  })

  it('tidak menambah halaman bila tidak ada overflow', () => {
    for (const gap of [0, -512]) {
      expect(
        grownPageCount({
          currentPageCount: 17,
          lastPageGap: gap,
          pageContentAreaHeight: PAGE_AREA,
          maxPagesByContent: 17,
        }),
      ).toBe(17)
    }
  })

  it('dibatasi jumlah halaman yang benar-benar dibutuhkan konten', () => {
    // Overflow besar, tetapi konten hanya butuh 8 halaman → cap di 9.
    expect(
      grownPageCount({
        currentPageCount: 6,
        lastPageGap: 9000,
        pageContentAreaHeight: PAGE_AREA,
        maxPagesByContent: 8,
      }),
    ).toBe(9)
  })

  it('tidak menambah halaman bila hitungan konten sudah tercapai', () => {
    // Hitungan konten (1) di bawah jumlah halaman saat ini (5): pagination sudah
    // melebihi kebutuhan, jadi overflow kecil tidak lagi menambah halaman.
    expect(
      grownPageCount({
        currentPageCount: 5,
        lastPageGap: 10,
        pageContentAreaHeight: PAGE_AREA,
        maxPagesByContent: 1,
      }),
    ).toBe(5)
  })

  it('tidak pernah melewati MAX_PAGES', () => {
    expect(
      grownPageCount({
        currentPageCount: MAX_PAGES,
        lastPageGap: PAGE_AREA * 5,
        pageContentAreaHeight: PAGE_AREA,
        maxPagesByContent: MAX_PAGES + 5,
      }),
    ).toBe(MAX_PAGES)
  })

  it('aman terhadap input rusak', () => {
    expect(
      grownPageCount({
        currentPageCount: 3,
        lastPageGap: Number.NaN,
        pageContentAreaHeight: PAGE_AREA,
        maxPagesByContent: 4,
      }),
    ).toBe(3)

    expect(
      grownPageCount({
        currentPageCount: 3,
        lastPageGap: 500,
        pageContentAreaHeight: 0,
        maxPagesByContent: 4,
      }),
    ).toBe(3)
  })
})
