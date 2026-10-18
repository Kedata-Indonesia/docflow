# Bukti UI — Indentasi blok Tab / Shift-Tab (`#189`)

Sebelum perbaikan, menekan **Tab** di dalam editor tidak meng-indentasi apa pun: tidak ada
extension yang mengklaim tombol tersebut, jadi browser memindahkan fokus ke elemen berikutnya
di luar editor. Dokumen ini merekam perbandingan perilaku nyata **sebelum vs sesudah**.

- **Base**: `main` @ `0ddf59e`
- **Head**: `fix/189-tab-indent-keymap`
- **Bukti ringkas**: [`before-after-indent.png`](./before-after-indent.png) (kiri = `main`,
  kanan = branch) — dokumen yang sama, diketik dengan urutan tombol yang sama.

## Metode pengambilan

1. Harness: `examples/playground` dijalankan dalam **mode source**
   (`PLAYGROUND_SOURCE=1 pnpm dev:source`, port 5200) supaya `packages/*` yang disajikan adalah
   source branch, bukan `dist` hasil build. Kedua sisi (base & head) memakai jalur yang sama,
   jadi tidak ada perbedaan bundling yang bisa mengaburkan hasil.
2. Dokumen: contoh `blank` (satu paragraf kosong, editor fokus).
3. Skenario diketik lewat **key event asli** (Playwright, Chrome headless) — bukan manipulasi
   DOM: mengetik, `Enter`, lalu `Tab`/`Shift+Tab` berselang-seling:

   ```
   Block indent with Tab / Shift-Tab
   No indent - sits at the left margin
   Tab                      → Tab once = 48px
   Enter + Tab              → Tab twice = 96px
   Enter + Tab              → Tab three times = 144px
   Enter + Shift-Tab ×3     → Shift-Tab walks back to the margin
   ```

4. Screenshot: `device` scale; area kertas 794×1238 px, viewport 1440×900 px.
5. Verifikasi akhir dijalankan `getComputedStyle` pada tiap blok di dokumen yang sama.

## Hasil

| Baris | `data-indent` (main) | `data-indent` (branch) | `margin-left` (main) | `margin-left` (branch) |
| --- | --- | --- | --- | --- |
| No indent - sits at the left margin | – | – | 0px | 0px |
| Tab once = 48px | – | `1` | 0px | 48px |
| Tab twice = 96px | – | `2` | 0px | 96px |
| Tab three times = 144px | – | `3` | 0px | 144px |
| Shift-Tab walks back to the margin | – | – | 0px | 0px |

- **main**: Tab tidak mengubah dokumen sama sekali; fokus keluar dari editor (perilaku bug).
- **branch**: Tab menaikkan level satu langkah (48px, paritas Google Docs) dan Shift-Tab
  menurunkannya; selama masih ada level untuk diubah, fokus tetap di dalam editor.
- **Batas clamp**: di level 0 dan level 8 tombol tidak diklaim, jadi browser memindahkan fokus
  keluar editor. Ini disengaja sebagai *escape hatch* keyboard (mirip Google Docs); lihat
  catatan di bagian "How to test".
- **Menu**: `Format ▸ Align & indent` di branch kini memuat **Increase indent** dan
  **Decrease indent** (lihat [`before-after-menu.png`](./before-after-menu.png)).

## Berkas bukti

| Berkas | Isi |
| --- | --- |
| `before-after-indent.png` | Gabungan sebelum & sesudah (kiri `main`, kanan branch), area kertas. |
| `before-tab-indent.png` / `after-tab-indent.png` | Versi terpisah, area kertas (794×1238). |
| `before-after-menu.png` | Gabungan submenu `Format ▸ Align & indent` (kiri `main`, kanan branch). |
| `before-menu-cropped.png` / `after-menu-cropped.png` | Versi terpisah, potongan 760×520 px di sekitar menu. |

## Gerbang mutu

| Perintah | Hasil |
| --- | --- |
| `pnpm lint` | bersih |
| `pnpm typecheck` | bersih (core, vue, element, playground) |
| `pnpm test:unit` | 445 lulus (core 130, vue 141, plugins 115, export 32, layout-engine 21, element 6) |
| `pnpm docs:api:check` | README API up to date |
| `pnpm test:e2e -- e2e/showcase/tab-indent.spec.ts` | 4/4 lulus |

Catatan e2e: harness playground memuat `dist`, jadi jalankan `pnpm build` lebih dulu
(atau pakai `pnpm dev:source`) sebelum `pnpm test:e2e`.

## How to test (QA)

1. `pnpm install && pnpm build`, lalu `pnpm dev`.
2. Buka <http://localhost:5200/>, pilih contoh **Blank**, klik di dalam kertas.
3. Ketik sebuah kalimat, tekan **Tab** → paragraf bergeser 48px ke kanan, kursor **tetap** di
   editor, dan mengetik lanjutan tetap nyambung.
4. Ulangi `Tab` sampai level 3 (144px). Di level 8 Tab tidak lagi menambah indent (clamp) dan
   fokus keluar dari editor — itu *escape hatch* yang disengaja.
5. Tekan **Shift+Tab** untuk mundur satu level. Di level 0 tidak ada perubahan dan fokus
   keluar dari editor (escape hatch yang sama).
6. `Enter` di paragraf terindentasi → paragraf baru mewarisi level indentasi.
7. Uji jalur lain: di **bullet list**, Tab tetap men-*nest* item; di dalam **code block**, Tab
   menyisipkan tab di posisi kursor; di **tabel**, Tab tetap pindah sel.
8. Menu: `Format ▸ Align & indent` → **Increase indent** / **Decrease indent** memberi hasil
   yang sama, dan `Format ▸ Clear formatting` mereset indentasi.

## Batasan yang diketahui (non-goal PR ini)

- Eksportir `docx`/`odt`/`rtf` **belum** memetakan level indentasi; dokumen diekspor rata
  kiri. Ini dinyatakan sebagai non-goal PR #192 dan perlu issue lanjutan.
- `margin-left` tidak dipulihkan dari paste: `pasteNormalization` hanya mempertahankan
  `color`/`background-color` dari `style`. Fallback `margin-left` di `parseIndentLevel` hanya
  berlaku untuk `createEditor({ content })` (HTML tersimpan/impor), bukan clipboard.
- Paste dokumen berindentasi dari Google Docs (`margin-left` inline) belum memetakan ke
  `data-indent`; hanya salin-tempel **di dalam** editor yang mempertahankan indentasi
  (`data-indent` sudah masuk allowlist `pasteNormalization`).
