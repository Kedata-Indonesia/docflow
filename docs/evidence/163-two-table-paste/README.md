# Bukti — Paste 2 tabel: page-break meledak + pita kosong di atas tabel kedua (`#163`)

Sebelum perbaikan, menempel dokumen *tracker* bergaya Google Docs berisi **dua tabel**
menghasilkan jumlah halaman yang tidak sesuai isi: dokumen berisi ~4.800 px konten
(≈6 halaman pada 887 px/halaman) tetapi dirender menjadi **7 halaman**, dengan **pita
kosong ~4.948 px** (≈4 halaman kosong) tepat di atas tabel kedua. Tabel kedua (2.267 px,
2,5 halaman) bahkan **tidak ikut ter-split** sama sekali.

- **Base**: `main` @ `0774fce`
- **Head**: `fix/163-two-table-paste-page-break`
- **Fixture**: payload paste asli dari laporan (`Jam 34b670b5` / `6a7c35d2`) — heading +
  tabel 6 baris + `h2` + 3 paragraf + tabel 6 baris, setiap sel berisi bullet 6 item
  (baris jadi ~400 px). Fixture yang sama dipakai oleh
  [`e2e/showcase/table-paste-pagination.spec.ts`](../../../e2e/showcase/table-paste-pagination.spec.ts),
  jadi bukti ini bukan kasus sintetis terpisah.

## Akar masalah (dari instrumentasi, bukan dugaan)

Tabel diproses berurutan dengan *cursor* budget per tabel. Setelah chain tabel pertama
menghasilkan chunk terakhir setinggi 653 px, sisa halaman = `935 − 653 = 282 px`. Sisa itu
dipakai sebagai *head budget* tabel kedua, padahal baris pertamanya **403 px** → lebih besar
dari budget → `findSplitRow` mengembalikan `-1` → `buildSplitChain` mengembalikan tabel
**utuh** (`chainLen 1`, 6 baris). PaginationPlus lalu berulang kali menyisipkan halaman kosong
untuk mendorong tabel setinggi 2,5 halaman itu ke satu halaman (detektor non-konvergensi
berhenti setelah 7 break).

Perbaikan: tabel yang **tidak muat walau satu baris** di sisa halaman **pindah ke halaman
berikutnya** dan mendapat budget satu halaman penuh (`resolveHeadBudget`), bukan dibiarkan
utuh.

## Angka terukur (playground, harness yang sama, mode source)

| Metrik | `main` | branch |
| --- | --- | --- |
| Chunk tabel | `[2, 2, 2, 6]` — tabel kedua utuh | `[2, 2, 2, 2, 2, 2]` |
| Total baris (invariant #192) | 12 | 12 |
| Tinggi chunk maksimum | 2.267 px (2,5 halaman) | 808 px (≤ 1 halaman) |
| Halaman / `.rm-page-break` | 7 | 6 |
| Pita kosong terlebar | **4.948 px** | **458 px** |
| Tinggi kertas penuh | 10.699 px | 7.147 px |

## Berkas bukti

| Berkas | Isi |
| --- | --- |
| `before-page-5-empty-band.png` | `main`: halaman 5 — kosong total, bagian dari pita kosong. |
| `before-page-8-unsplit-table.png` | `main`: halaman 8 — tabel kedua utuh (2.267 px) meluber ke halaman berikutnya. |
| `after-page-5-chunk-at-top.png` | branch: halaman 5 — chunk 2 baris mulai di atas halaman, tanpa pita kosong. |
| `after-page-6-chunk-at-top.png` | branch: halaman 6 — chunk terakhir, dokumen selesai di halaman 6. |

Screenshot diambil per halaman (viewport 1512×1000, `device` scale) dengan menggeser
*scroll container* ke posisi tiap `.breaker`. Screenshot elemen seluruh kertas **tidak**
dipakai: kertas setinggi 7.000–10.000 px dengan toolbar *sticky* membuat hasil *stitch*
menyesatkan (terlihat seolah isi dokumen hanya ada di halaman terakhir).

## Gerbang mutu

| Perintah | Hasil |
| --- | --- |
| `pnpm lint` | bersih |
| `pnpm typecheck` | bersih (semua paket + playground) |
| `pnpm test:coverage` | lulus, threshold per paket — 446 tes (core 130, vue 141, plugins 116, export 32, layout-engine 21, element 6) |
| `pnpm test:scripts` | 56 lulus |
| `pnpm docs:api:check` | README API up to date |
| `pnpm test:e2e` | 17 lulus (16 showcase yang sudah ada + 1 spec baru) |

Regression guard: `packages/plugins/src/__tests__/tablePageSplit.test.ts` (unit) dan
`e2e/showcase/table-paste-pagination.spec.ts` (geometri halaman di demo). Keduanya sudah
dibuktikan **merah** saat file plugin dikembalikan ke `main`:

- unit: `expected 6 to be less than or equal to 2` (tabel kedua tetap 6 baris);
- e2e: `Expected: 6, Received: 4` (tabel kedua tidak ter-split, hanya 4 chunk).

## How to test (QA)

1. `pnpm install && pnpm build`, lalu `pnpm dev:source` (mode source, port 5200).
2. Buka <http://localhost:5200/>, pilih preset **Blank**, klik di dalam kertas.
3. Copy dokumen tracker 2 tabel dari Google Docs (atau pakai fixture di spec e2e), lalu
   tempel ke editor.
4. Periksa penghitung halaman di status bar: harus **6** untuk payload ini (sebelum
   perbaikan: 7), dan **tidak ada halaman kosong** di antara paragraf dan tabel kedua.
5. Setiap chunk tabel harus muat satu halaman; tidak ada tabel yang meluber melewati batas
   bawah kertas.
