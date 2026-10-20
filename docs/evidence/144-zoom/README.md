# Issue #144 — Kontrol zoom di toolbar editor

## Yang dikerjakan

- **Toolbar zoom** — tombol `100%` statis diganti dropdown preset
  **50 / 75 / 100 / 125 / 150 / 200 %** (`ToolbarZoom.vue`), dengan label
  persentase aktif, `aria-expanded`/`aria-haspopup`, dan testid untuk e2e.
- **Visual zoom** — kertas + konten di-scale lewat wrapper (`useZoomSurface`)
  dengan `transform: scale()`. Layout dokumen tetap 100 %, jadi paginasi tidak
  perlu dihitung ulang pada ukuran berbeda.
- **Patch PaginationPlus** — `patches/tiptap-pagination-plus@3.1.0.patch`
  menormalkan `getBoundingClientRect()` (px visual) ke layout px menggunakan
  CSS variable `--docflow-zoom` sebelum dibandingkan dengan `pageContentAreaHeight`.
  Tanpa patch ini, page count ikut ter-multiply oleh zoom (150 % → 3 halaman).
- **Ruler** — tick, margin marker, dan tinggi ruler ikut scale; horizontal ruler
  diukur terhadap posisi visual kertas (`useRulerSync`), jadi tetap sejajar saat
  halaman di-scroll horizontal pada 200 %.
- **Print** — transform di-reset di `@media print`.
- **Virtual pages** — belum zoom-aware: kontrol dinonaktifkan dan nilai dipin ke
  100 % selama `virtualPages` aktif.
- **API host** — prop `zoom` (persen, default 100, clamp 50–200) + emit
  `update:zoom`; preset diekspor (`ZOOM_PRESETS`, `normalizeZoom`). Playground
  mempersistensikan pilihan ke `localStorage`.

## Demo (source mode, `:5200`)

Diuji dengan dokumen "Meeting invitation letter" (2 halaman):

| Zoom | Paper visual | Layout | Page count | Ruler width = paper | Horizontal scroll |
|---|---|---|---|---|---|
| 50 % | 397 × 1210 | 794 × 2420 | 2 | ✅ | tidak ada |
| 100 % | 794 × 2420 | 794 × 2420 | 2 | ✅ | tidak ada |
| 150 % | 1191 × 3630 | 794 × 2420 | 2 | ✅ | 24 px |
| 200 % | 1588 × 4840 | 794 × 2420 | 2 | ✅ | 416 px |

Selisih `ruler.left` vs `paper.left` = **0 px** di semua preset, termasuk setelah
`scrollLeft = 250` pada 200 %. Print media mengembalikan `transform: none`.
Screenshot: [50 %](./zoom-50.png) · [100 %](./zoom-100.png) ·
[150 %](./zoom-150.png) · [200 %](./zoom-200.png).

## Gate

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm docs:api:check` — pass.
- `pnpm test:scripts` — 67 pass (termasuk ratchet ukuran file toolbar).
- Unit baru: `useEditorZoom` (4), `useZoomSurface` (1), `useRulerSync` (1),
  ruler zoom (3) — pass. `ToolbarZoom` bergantung pada observasi emit Vue Test
  Utils; di Node 26 lokal observasi itu sudah rusak untuk semua komponen (50
  kegagalan pre-existing di `main`), jadi test emit-nya gagal lokal dan lolos di
  CI (Node 20/22).
- E2E: `e2e/showcase/zoom.spec.ts` — **5 pass**; full suite **33 pass**
  (`--workers=1`).

## Batasan

- Zoom tidak didukung saat `virtualPages` aktif (kontrol disabled, nilai 100 %).
- Zoom adalah preferensi host: library mengirim `update:zoom`, tidak menyimpannya.
- Export DOCX/PDF memakai model dokumen, bukan zoom tampilan.
