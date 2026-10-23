# Bukti perbaikan — parsing SSE (`#384`)

Dokumen ini merekam bukti perbaikan parser SSE pada provider AI di `@kedata-indonesia/docflow-core`.

- **Base**: `main` @ `c20827a`
- **Head**: `fix/384-sse-parsing`
- **Issue**: [#384](https://github.com/Kedata-Indonesia/docflow/issues/384)

## 1. Masalah

Kedua provider (`openaiCompatibleProvider` dan `claudeProvider`) memecah stream dengan
`buffer.indexOf('\n\n')` lalu mem-`JSON.parse` **setiap baris** `data:` secara terpisah. Dua hal
yang diizinkan spesifikasi SSE jadi tidak tertangani:

1. **Akhir baris CRLF.** Server yang mengirim `\r\n\r\n` tidak pernah cocok dengan `'\n\n'`, jadi
   tidak ada delta yang dipancarkan dan UI hanya menerima `done` — jawaban tampak kosong.
2. **Field `data:` multi-baris.** Satu event boleh terdiri dari beberapa baris `data:` yang harus
   digabung dengan `'\n'` sebelum di-parse. Kalau di-parse per baris, setiap potongan JSON tidak
   valid dan ditelan `catch` — jawaban juga kosong.

## 2. Perbandingan Sebelum vs Sesudah

Harness memakai stream OpenAI-shaped yang sama, dijalankan lewat parser lama (inline, disalin dari
kode sebelum perbaikan) dan parser baru (`takeSseEvent()`).

| Stream | Parser lama | Parser baru |
| --- | --- | --- |
| CRLF (`\r\n\r\n`), delta `Hello, ` + `world!` | `[]` → hanya `done`, jawaban kosong | `["Hello, ", "world!"]` |
| LF (`\n\n`), kontrol regresi | `["Hello, ", "world!"]` | `["Hello, ", "world!"]` |
| `data:` multi-baris (JSON pretty-print) | `[]` → setiap potongan gagal di-parse | `["multi-line answer"]` |

Fixture yang dipakai:

- [`crlf-stream.txt`](./crlf-stream.txt) — `\r` ditampilkan sebagai `<CR>`
- [`multiline-stream.txt`](./multiline-stream.txt)

## 3. Perubahan

- `packages/core/src/ai/sse.ts` — helper baru `takeSseEvent(buffer)`:
  - memisahkan event dengan `/\r?\n\r?\n/`,
  - menggabungkan seluruh baris `data:` pada satu event dengan `'\n'`,
  - menghapus satu spasi opsional setelah `data:` (sesuai spesifikasi),
  - mengembalikan `data: null` untuk event tanpa payload (komentar/keep-alive),
  - mengembalikan `null` selama separator belum lengkap, sehingga aman untuk chunk boundary.
- Kedua provider memakai helper tersebut; penanganan `[DONE]`, `message_stop`, `stop_reason`, dan
  event `error` tidak berubah.

## 4. Cara memverifikasi

```bash
# Unit test (7 test helper + 2 test CRLF + 2 test multi-baris, per provider = 11 test baru)
pnpm --filter @kedata-indonesia/docflow-core test:unit
```

Hasil: 19 file, **172 test** lulus (sebelumnya 161). Untuk memeriksa manual, kirim stream dari
fixture di atas ke `complete()` provider dan pastikan delta `Hello, ` dan `world!` muncul; sebelum
perbaikan hanya `done` yang keluar.

Bukti bahwa perbaikan tidak mengubah perilaku normal: baris "LF (kontrol)" di tabel di atas tetap
sama antara parser lama dan baru.

## 5. Hasil pemeriksaan

| Pemeriksaan | Hasil |
| --- | --- |
| `pnpm --filter @kedata-indonesia/docflow-core test:unit` | 19 file, 172 test lulus |
| `tsc --noEmit` | bersih |
| `eslint packages/core/src --max-warnings 0` | exit 0 |
| `docs:check` | tidak ada link rusak |
