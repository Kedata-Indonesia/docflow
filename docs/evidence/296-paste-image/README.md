# Bukti UI — Paste gambar dari clipboard (`#296`)

Sebelum perbaikan, menempel gambar dari clipboard (screenshot atau “Copy image”)
tidak menghasilkan apa pun. Editor hanya membaca `text/html` dan `text/plain`,
sehingga clipboard yang berisi gambar saja jatuh ke jalur teks dan berakhir
kosong.

- **Base**: `main` @ `ca8c2b4`
- **Head**: `feat/296-paste-image`
- **Bukti ringkas**: [`before.png`](./before.png) vs [`after.png`](./after.png)
  — dokumen dan langkah yang sama, hasil berbeda.

## Skenario

1. Buka playground (dokumen contoh), klik di awal paragraf pertama.
2. Ketik `Paste image check` lalu `Enter`.
3. Siapkan clipboard berisi satu file gambar PNG (360×140, dibuat lewat
   `<canvas>` di halaman agar ukurannya terlihat).
4. Tempel lewat **Ctrl/Cmd+V** (jalur `paste` native).

Hasil yang direkam script:

| Build | Gambar di dokumen setelah paste |
| --- | --- |
| `main` (before) | **0** |
| `feat/296-paste-image` (after) | **1** |

Selain jalur native, menu **Edit ▸ Paste** juga diuji dengan clipboard gambar
yang sama dan menambah satu gambar lagi (total 2) — jalur menu memakai
`navigator.clipboard.read()`, jalur native memakai `ClipboardEvent.clipboardData`.
Keduanya berakhir di helper yang sama (`insertPastedImage`).

## Metode pengambilan

1. Harness: `examples/playground` dijalankan dalam **mode source**
   (`pnpm dev:source`, port 5200) supaya `packages/*` yang disajikan adalah
   source branch, bukan `dist` hasil build. Server di-restart setiap kali
   berpindah branch agar modul yang disajikan tidak tertinggal.
2. Browser: Chromium headless via Playwright, viewport 1440×900.
3. Clipboard disintesis di dalam halaman (`DataTransfer` + `File` dari
   `canvas.toBlob`) karena headless Chromium tidak bisa menulis clipboard OS.
   Ini tetap menguji jalur kode yang sama dengan paste pengguna: event `paste`
   nyata yang diteruskan ke editor.
4. Screenshot diambil dengan area klip yang sama untuk kedua build.

## Batasan

- Izin clipboard nyata (Clipboard API) tidak diuji di sini; helper menangani
  penolakan izin dengan mengembalikan `null` (ada unit test-nya).
- Jalur unggah host (`onImageUpload`) diverifikasi lewat unit + integration test;
  playground tidak memasang port tersebut sehingga bukti visual memakai
  fallback data URL.
