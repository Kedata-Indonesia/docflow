# Bukti UI — Preview typeface di dropdown font (`#188`)

Sebelum perbaikan, semua opsi di dropdown **Font family** dirender dengan font
UI yang sama (Inter), dan tombol trigger-nya juga tidak memakai font aktif,
sehingga pengguna tidak bisa membandingkan bentuk huruf sebelum memilih.
Sesudah perbaikan, setiap opsi memakai font stack yang akan diterapkan ke teks,
dan trigger menampilkan font dari seleksi saat ini.

- **Base**: `main` @ `8c95be9`
- **Head**: `feat/188-font-preview`
- **Bukti ringkas**: [`before.png`](./before.png) vs [`after.png`](./after.png)
  — area toolbar, langkah identik di kedua build.

## Metode pengambilan

1. Harness: `examples/playground` mode source (`pnpm dev:source`, port 5200).
   Server di-restart setiap kali berpindah branch agar modul yang disajikan
   tidak tertinggal di cache Vite.
2. Browser: Chromium headless via Playwright, viewport 1440×900.
3. Langkah: buka playground → buka dropdown **Font family** → pilih
   **Times New Roman** (supaya font aktif bukan Inter) → buka dropdown lagi →
   ambil screenshot gabungan trigger + panel dropdown.
4. Verifikasi tambahan: `getComputedStyle()` pada tiap opsi dan pada trigger
   harus mengembalikan font stack masing-masing (mis. `Arial, Helvetica,
   sans-serif`, `"Times New Roman", Times, serif`), bukan font UI.
