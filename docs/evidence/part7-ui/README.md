# Bukti UI — DocsEditor part 7 (`#44`)

Part 7 merampingkan `DocsEditor.vue` dari **705 → 297 baris** dengan mengekstraksi 5 composable (7A)
dan 2 komponen anak (7B). Refactor ini **tidak mengubah tampilan**. Dokumen ini merekam bukti
rendering UI nyata sebelum vs sesudah.

- **Base**: `refactor/docseditor-part6` @ `e27e79d` (state part 6)
- **Head**: `refactor/docseditor-part7`
- **Bukti visual**: [`contact-sheet.png`](./contact-sheet.png) — 7 state, kiri = part 6, kanan = part 7, 1440×900.

## Metode pengambilan

1. Harness Vite sementara (`packages/vue/harness/`, **tidak** di-commit) me-render `DocsEditor.vue`
   langsung dari source berikut `src/styles/index.css` (Tailwind), tanpa mock.
2. Konten uji: H1 + 22 paragraf + bullet list + blockquote → dokumen ternaginasi 6 halaman.
3. Setiap state dikemudikan lewat entry point asli komponen — permukaan yang sama dengan unit test:
   `menuClick('page-setup' | 'details' | 'version-history' | 'find-replace')` dan
   `toggleSidebar('references' | 'comments')`.
4. Screenshot full-page diambil dua kali: `git show e27e79d:packages/vue/src/components/DocsEditor.vue`
   (before) dan working tree part 7 (after). Opsi capture: `animations: 'disabled'`,
   `caret-color: transparent`, teks jam pada status bar di-mask.

## Hasil per state (full-page 1440×900)

| #   | State              | Cara                          | Hasil                                        |
| --- | ------------------ | ----------------------------- | -------------------------------------------- |
| 1   | Default view       | –                             | **md5 identik** (`eb1cc444…`)                |
| 2   | References sidebar | `toggleSidebar('references')` | **md5 identik** (`ef1d575b…`)                |
| 3   | Comments sidebar   | `toggleSidebar('comments')`   | **md5 identik** (`a533d038…`)                |
| 4   | Version history    | `menuClick('version-history')`| **md5 identik** (`5d4c9c5d…`)                |
| 5   | Find & replace     | `menuClick('find-replace')`   | **md5 identik** (`6e4eaa42…`)                |
| 6   | Page setup dialog  | `menuClick('page-setup')`     | 117 px beda (0,01 %) — lihat catatan         |
| 7   | Details dialog     | `menuClick('details')`        | 101 px beda (0,01 %) — lihat catatan         |

Catatan state 6–7: seluruh piksel yang berbeda berada di **bbox yang sama** `[261..304, 869..896]`,
yaitu garis tepi kotak *mask* untuk jam di status bar — bukan piksel aplikasi. Bukti tambahan: dua
capture dari **revisi part 6 yang sama** juga berbeda 132 px pada bbox identik, jadi selisih ini
adalah noise proses capture, bukan perbedaan versi. Kesimpulan: **0 piksel aplikasi berbeda** pada
ketujuh state.

## Kesetaraan struktur DOM

- Probe 10 varian state (`defaults`, `rich`, `landscape-margins`, `pageless`, `virtual-pages`,
  `dialogs-open`, `sidebar-references`, `sidebar-comments`, `sidebar-history`, `sidebar-ai`) pada
  `e27e79d` vs part 7: **10/10 element-tree identik** (setelah normalisasi hash scope SFC dan teks jam).
- Probe binding: **43/43** nama `vm.*` yang dipakai `DocsEditor.test.ts` tetap resolve; komponen
  internal-only tidak bocor ke `index.ts`.
- Catatan (bukan regresi): jumlah halaman hasil paginasi kadang terbaca 5 atau 6 untuk state yang sama
  **di dalam satu revisi** (terbukti pada part 6) — efek settle font/layout pada harness, bukan
  perbedaan versi.

## File terdampak

| File                                                     | Baris     | Keterangan                                          |
| -------------------------------------------------------- | --------- | --------------------------------------------------- |
| `packages/vue/src/components/DocsEditor.vue`             | 705 → 297 | orkestrator; script + template dirampingkan         |
| `packages/vue/src/composables/useDocsEditorSession.ts`   | +225      | state dokumen/sesi, tab, plugin action, focus mode   |
| `packages/vue/src/composables/useDocsEditorPaging.ts`    | +120      | opsi paginasi + snapshot                             |
| `packages/vue/src/composables/useDocsEditorPageSurface.ts` | +113    | ukuran halaman, ruler, mode pageless                 |
| `packages/vue/src/composables/useDocsEditorHeaderFooterState.ts` | +93 | header/footer inline edit + draft                    |
| `packages/vue/src/composables/useDocsEditorBootstrap.ts` | +30       | bootstrap mount/emit                                 |
| `packages/vue/src/components/DocsEditorSidebars.vue`     | +111      | 4 sidebar kanan (16 props / 15 emit)                 |
| `packages/vue/src/components/DocsEditorDialogs.vue`      | +172      | 7 dialog modal (34 props / 30 emit)                  |
| `packages/vue/src/__tests__/DocsEditorSidebars.test.ts`  | +130      | 5 test bridge sidebar                                |

## Gate

| Gate                        | Hasil                          |
| --------------------------- | ------------------------------ |
| `eslint . --ext .ts,.vue`   | exit 0, 0 warning              |
| `vue-tsc --noEmit`          | exit 0                         |
| `vitest run`                | 14 file / 93 test lulus        |
| `vite build` + `emitDeclarationOnly` | exit 0                |
| `DocsEditor.test.ts`        | lulus **tanpa diubah**         |

## Cara uji (QA)

1. `pnpm i`
2. `pnpm --filter @kedata-indonesia/docflow-vue typecheck`
3. `pnpm --filter @kedata-indonesia/docflow-vue test:unit`
4. Integrasi di host app: buka berurutan — sidebar references, sidebar comments, version history,
   dialog page setup, dialog details, find & replace, header/footer, page number, tab dokumen.
   Semua harus tampil dan berperilaku sama seperti sebelum part 7.
5. Bandingkan dengan `contact-sheet.png` (kiri = sebelum, kanan = sesudah) — harus identik.
