# Bukti perbaikan — SSE line ending CR (`#398`)

Dokumen ini merekam bukti perbaikan framing SSE untuk line ending CR tunggal pada
`@kedata-indonesia/docflow-core`.

- **Base**: `main` @ `cc9a556`
- **Head**: `fix/398-sse-cr-only`
- **Issue**: [#398](https://github.com/Kedata-Indonesia/docflow/issues/398)

## 1. Masalah

Sejak #384, `takeSseEvent()` menerima LF dan CRLF, tetapi belum CR tunggal — padahal spesifikasi
SSE mengizinkan ketiganya. Server yang memakai `\r` sebagai akhir baris dan `\r\r` sebagai akhir
event tidak pernah menghasilkan event lengkap: tidak ada delta, UI hanya menerima `done`, dan
`buffer` terus tumbuh sampai stream selesai.

## 2. Perbandingan Sebelum vs Sesudah

Harness membandingkan helper di `main` (`/\r?\n\r?\n/`) dengan helper sekarang.

| Kasus | Helper `main` | `(?:\r\n|\r|\n){2}` tanpa lookahead | Helper sekarang |
| --- | --- | --- | --- |
| CR-only: `data: Hello, \r\rdata: world! \r\r` | `null` → jawaban kosong | benar | benar |
| CR-only multi-baris: `data: {\rdata:   "a": 1\rdata: }\r\r` | `null` | — | `{\n  "a": 1\n}` |
| CRLF dengan `event:` + `data:` (satu CRLF per baris) | benar | **`null`** → event hilang | benar |
| LF (kontrol regresi) | benar | benar | benar |

Fixture:

- [`cr-only-stream.txt`](./cr-only-stream.txt) — `\r` ditampilkan sebagai `<CR>`
- [`crlf-event-stream.txt`](./crlf-event-stream.txt) — `\r\n` ditampilkan sebagai `<CRLF>`

## 3. Jebakan regex: kenapa butuh `\r(?!\n)`

Regex dari issue, `/(?:\r\n|\r|\n){2}/`, **tidak cukup**. Saat sebuah baris diakhiri CRLF tunggal
(mis. `event: content_block_delta\r\ndata: ...`), mesin regex mencoba `\r\n` sebagai terminator
pertama, gagal menemukan terminator kedua, lalu **backtrack**: `\r` diambil alternatif ketiga dan
`\n` dianggap terminator kedua. Satu CRLF jadi dianggap baris kosong, event dipotong sebelum
`data:` — persis baris "CRLF dengan `event:`" di tabel di atas.

Perbaikannya menambahkan lookahead agar `\r` tidak boleh diikuti `\n`:

```ts
const separator = /(?:\r\n|\r(?!\n)|\n){2}/.exec(buffer)
```

Ada test regresi khusus untuk kasus ini, jadi kesalahan yang sama tidak bisa masuk lagi.

## 4. Perubahan

- `packages/core/src/ai/sse.ts` — separator menerima LF/CR/CRLF dengan lookahead; pemisah baris
  `block.split(/\r\n|\r|\n/)`.
- Komentar di `openaiCompatibleProvider.ts` dan `claudeProvider.ts` diperbarui.
- Test baru (5): 3 di `sse.test.ts` (CR-only, CR-only multi-baris, separator `\r\n\r` terpotong
  tiga byte) dan 1 di masing-masing provider (CR-only end-to-end).

Catatan perilaku: bila separator CRLF terpotong tepat setelah tiga dari empat byte (`\r\n\r`),
helper menganggap event selesai. Ini aman karena payload sudah lengkap; sisa `\n` menjadi baris
kosong di awal block berikutnya yang diabaikan. Sudah ada test-nya.

## 5. Cara memverifikasi

```bash
pnpm --filter @kedata-indonesia/docflow-core test:unit
```

Hasil: 19 file, **177 test** lulus (sebelumnya 172).

| Pemeriksaan | Hasil |
| --- | --- |
| Unit test core | 19 file, 177 test lulus |
| `tsc --noEmit` | bersih |
| `eslint packages/core/src --max-warnings 0` | exit 0 |
| `docs:check` | tidak ada link rusak |
