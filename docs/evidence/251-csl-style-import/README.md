# Issue #251 — Impor gaya sitasi dari file `.csl`

Status: **selesai** (runtime import `.csl`; `.bst`/`.ens` ditolak dengan pesan yang jelas).

## Yang dikerjakan

- **Parser metadata** — [`packages/plugins/src/csl/parseCslStyle.ts`](../../../packages/plugins/src/csl/parseCslStyle.ts)
  membaca XML CSL tanpa DOM/dependency baru: `id` dari `<info><id>` (URI; segmen terakhir dipakai,
  mis. `…/styles/apa` → `apa`) dengan fallback `id` di root, `name` dari `<info><title>`, dan
  `category` dari `<category citation-format>` (fallback `class` di root). File kosong/terpotong/
  bukan CSL ditolak dengan error yang jelas.
- **Registrasi runtime** — `CiteEngine.registerStyle(info)` memvalidasi XML dengan citeproc
  **sebelum** mengubah registry. File rusak tidak mengubah registry, gaya aktif, atau output yang
  sedang tampil. Id yang sudah ada diganti (aturan yang sama dengan `CitationPort.styles`, #180).
- **UI** — References sidebar punya tombol **Import .csl style** + input file di blok Citation
  Style (tidak bergantung pada port impor referensi host). Gaya yang diimpor langsung muncul di
  dropdown dan otomatis dipilih. Pesan sukses/format-tidak-didukung/invalid tampil di bawah picker.
- **Persistence host** — emit baru `citation-style-imported` membawa `{ id, name, category, xml }`.
  Playground menyimpannya di `localStorage` dan mengirimkannya kembali lewat `citation.styles`
  saat mount berikutnya — contoh lengkap untuk host.
- **Docs/kontrak** — `docs/reference/LIBRARY_CONTRACT.md` (port `styles`, emit baru, aturan impor),
  README API (emit), CHANGELOG.

## Demo (source mode, port 5200)

1. Buka **References** → **Import .csl style**.
2. Impor `vancouver.csl` asli dari zotero.org (`NLM/Vancouver: Citing Medicine 2nd edition`).
   Gaya muncul di picker, otomatis terpilih, dan sitasi dirender dengan layout numerik `(1)`.
3. Pilih file `.bst` → pesan "`.bst and .ens styles are not supported yet…`".
4. Pilih file `.ens` → pesan yang sama.
5. Impor `.csl` rusak (`<style>`) → pesan "That file is not a valid CSL style."; gaya aktif tetap.
6. Reload halaman → gaya impor masih ada di picker (persistence demo).

Bukti: [`imported-style.png`](./imported-style.png) (sidebar setelah impor Vancouver).

## Batasan yang disengaja

- `.bst` (BibTeX/LaTeX) dan `.ens` (EndNote) **bukan CSL**; tidak dikonversi. Konversi butuh
  desain/isu terpisah.
- Gaya impor bersifat session-only di library; host yang ingin persist antar sesi menyimpan objek
  dari `citation-style-imported` dan mengirimkannya kembali melalui `citation.styles`.
- Bundling empat gaya bawaan tidak berubah (tetap offline; isu ukuran bundle tetap terpisah).

## Gate

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm docs:api:check` — pass.
- `packages/plugins` unit — **138 pass** (termasuk 7 test parser + 6 test registrasi runtime).
- E2E baru `e2e/showcase/citation-style-import.spec.ts` — pass.
- `packages/vue` full suite di mesin ini memiliki kegagalan emit VTU yang **juga ada di `main`
  bersih** (Node 26); test baru yang tidak bergantung pada emit VTU pass, dan alur nyata diverifikasi
  di demo + e2e.
