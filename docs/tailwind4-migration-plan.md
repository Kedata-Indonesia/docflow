# Rencana migrasi Tailwind CSS 3 → 4 (issue #215)

Status: **selesai** — migrasi di `packages/vue`, `packages/element`, dan
`examples/playground` (PR #281) dan verifikasi konsumsi di `docflow-app` (Fase E) beres:
app berjalan di `docflow-vue` 0.0.153 / `docflow-element` 0.0.150 dengan Tailwind 4, suite
e2e-nya hijau.
Dokumen ini sengaja ditulis sebelum migrasi supaya "berhasil" punya definisi yang bisa
diperiksa, bukan sekadar "build hijau".

---

## 1. Kondisi terukur hari ini

Diambil langsung dari repo pada commit `main` saat rencana ini ditulis.

| Hal | Nilai |
|---|---|
| Versi | `tailwindcss ^3.4.1` di `packages/vue`, `packages/element`; `^3.4.19` di `examples/playground` |
| Entry CSS | **satu** file: `packages/vue/src/styles/index.css` (`@tailwind base/components/utilities`) |
| Config | **tiga**: `packages/vue/tailwind.config.js`, `packages/element/tailwind.config.js`, `examples/playground/tailwind.config.js` |
| PostCSS | tiga `postcss.config.js`, semuanya `tailwindcss: {}` + `autoprefixer: {}` |
| `@apply` | **0** (enam kemunculan `@apply…` di grep ternyata atribut event Vue, mis. `@apply-header-format`) |
| `theme()` di CSS | **0** |
| Modifier `!` (mis. `!flex`) | **0** |
| Arbitrary value (`w-[…]`) | **233** kemunculan |
| Dark mode | kelas `.dark` di `<html>` (`useTheme.ts`), bukan media query |
| Token tema | `fontFamily` (Inter / Lora / JetBrains Mono) + `boxShadow` (`cyan`, `page`, `page-dark`) |
| Pemakaian lintas paket | config `element` memindai `../../packages/vue/src/**/*.{vue,ts,tsx}`; `playground` meng-import config `vue` (hanya untuk `PLAYGROUND_SOURCE=1`) |

Kesimpulan penting: migrasi ini **tidak** menyentuh `@apply`, `theme()`, atau modifier
`!` — tiga sumber kesulitan yang biasanya paling merepotkan. Yang tersisa adalah
direktif, konfigurasi, dan **perubahan default utility** di v4.

---

## 2. Kenapa gate visual harus ada lebih dulu

v4 mengubah *default*, bukan cuma sintaks. Yang relevan untuk UI ini:

- warna border default: `gray-200` → `currentColor` (border yang tidak menyebut warna
  akan berubah warna secara diam-diam);
- lebar `ring` default: 3px → 1px, dan nama skala bayangan/blur bergeser
  (`shadow-sm` → `shadow-xs`, `shadow` → `shadow-sm`);
- `outline-none` → `outline-hidden` (perilaku aksesibilitasnya berbeda);
- `hover:` hanya aktif di perangkat yang mendukung hover;
- selektor `space-y-*` berubah, sehingga jarak bertumpuk bisa bergeser.

Unit test dan e2e yang ada menguji **struktur dan geometri** (`rm-page-break`, lebar
kolom tabel), bukan tampilan. Tombol yang warnanya berubah tetap lolos semua gate.
Karena itu migrasi dikerjakan dengan pembanding piksel, bukan dengan keberanian.

---

## 3. Harness pembanding visual (sudah tersedia di PR ini)

```
e2e/visual/capture.spec.ts     # 5 state, project Playwright `visual`
scripts/visual-diff.mjs        # diff piksel antar dua direktori capture
```

Cara pakai:

```bash
# 1. sebelum migrasi (di branch bersih dari main)
VISUAL_OUT=visual-runs/before pnpm exec playwright test --project=visual

# 2. sesudah migrasi
VISUAL_OUT=visual-runs/after  pnpm exec playwright test --project=visual

# 3. bandingkan
node scripts/visual-diff.mjs visual-runs/before visual-runs/after
```

State yang di-capture: `editor-light`, `editor-dark`, `dropdown-heading`,
`dropdown-text-color`, `paper-paginated`. Output tidak pernah di-commit
(`visual-runs/` masuk `.gitignore`).

**Determinisme sudah diukur, bukan diasumsikan.** Dua capture berturut-turut pada kode
yang sama:

```
editor-light         identical        0.000%   0 px
editor-dark          identical        0.000%   0 px
paper-paginated      identical        0.000%   0 px
dropdown-heading     within tolerance 0.001%  13 px
dropdown-text-color  within tolerance 0.002%  21 px
```

Jadi noise floor harness ini ≈ **20 px pada popup**. Perubahan gaya sungguhan
(warna border, lebar ring) akan menghasilkan ribuan piksel — tiga orde besaran di atas
noise, sehingga mudah dibedakan tanpa menebak.

Harness ini **tidak** dijadikan gate CI. Baseline akan berubah setiap kali desain
berubah dengan sengaja, dan job visual yang selalu merah adalah job yang tidak dibaca
siapa pun. Ia dipakai sebagai alat bukti selama migrasi.

---

## 4. Langkah migrasi

### Fase A — harness + baseline

- [x] spec capture 5 state + `scripts/visual-diff.mjs`
- [x] determinisme diukur (angka di §3)
- [x] baseline `visual-runs/before` dibuat dari `main` sebelum dependensi disentuh

### Fase B — `packages/vue` ke v4

1. Direktif di `src/styles/index.css`:
   ```css
   @import "tailwindcss";
   ```
   menggantikan tiga `@tailwind …`.
2. Token tema dari `tailwind.config.js` → CSS:
   ```css
   @theme {
     --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
     --font-serif: Lora, Georgia, Cambria, "Times New Roman", Times, serif;
     --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
     --shadow-cyan: 0 0 15px rgb(34 211 238 / 0.15);
     --shadow-page: …;
     --shadow-page-dark: …;
   }
   ```
3. Dark mode tetap berbasis kelas:
   ```css
   @custom-variant dark (&:where(.dark, .dark *));
   ```
4. PostCSS: `tailwindcss: {}` → `'@tailwindcss/postcss': {}`; `autoprefixer` tetap.
5. Sumber kelas di monorepo: v4 mendeteksi otomatis, tetapi karena `element` dan
   `playground` memindai sumber paket lain, tambahkan eksplisit
   `@source "../../packages/vue/src";` di entry CSS paket yang membutuhkannya —
   jangan bergantung pada deteksi otomatis di dalam pnpm workspace.
6. Periksa 233 arbitrary value: v4 mengganti sebagian sintaks variabel
   (`bg-[--x]` → `bg-(--x)`), dan utility yang sudah tidak ada
   (`bg-opacity-*`, `flex-shrink-*`) perlu dipetakan ulang.

Gate fase B: `pnpm lint`, `typecheck`, `test:unit`, `build`, `e2e` **dan**
`node scripts/visual-diff.mjs` dengan **0 state di luar toleransi**, atau setiap diff
di-triage satu per satu dengan catatan penyebabnya.

**Status: selesai.** Hasil terukur ada di §8.

### Fase C — `packages/element` dan `examples/playground` (selesai)

Config keduanya berhenti jadi config Tailwind (dihapus atau tinggal `postcss.config.js`),
token diambil dari CSS yang sama. `playground` hanya butuh konfigurasi tambahan pada
mode `PLAYGROUND_SOURCE=1`; mode default memakai `dist/style.css` yang sudah terkompilasi.

### Fase D — pembersihan (selesai)

- hapus `tailwind.config.js` yang sudah tidak dipakai (jangan sisakan config mati yang
  membingungkan);
- hapus entri `ignore` `tailwindcss >= 4.a < 5` dari `.github/dependabot.yml`, supaya
  update Tailwind berikutnya kembali ditawarkan otomatis;
- perbarui `docs/` yang menyebut Tailwind 3 bila ada.

### Fase E — rilis & konsumsi

Patch release otomatis lewat `publish.yml`; setelah itu `docflow-app` (repo terpisah,
default branch `development`) menerima `vue`/`element` baru dan harus diperiksa
tampilannya di sana — UI app memakai kelas Tailwind-nya sendiri, jadi migrasi library
tidak otomatis memperbaikinya.

**Status: selesai.** `docflow-app` sekarang di `docflow-vue` 0.0.153 dan
`docflow-element` 0.0.150 (pin tunggal di blok `catalog:`), sudah melewati migrasi Tailwind 4
sendiri dan memakai stylesheet library yang berlayer; suite e2e app hijau.

Selama transisi muncul regresi nyata yang layak dicatat di sini, karena persis inilah alasan
Fase E ada: rilis library yang masih Tailwind 3 mengirim utility **unlayered**, sehingga
`.hidden` milik library mengalahkan `lg:table-cell` milik app dan kolom dashboard runtuh.
Kesimpulannya bukan "build app hijau berarti aman", melainkan app **harus** memakai rilis
v4 library — `@source` ke `dist` library juga wajib, kalau tidak kelas komponen tidak
teremit di stylesheet app.

---

## 5. Kriteria terima (DoD #215)

1. `tailwindcss` 4.x di ketiga paket, tidak ada sisa dependensi v3 di lockfile.
2. Tidak ada `tailwind.config.js` yang masih dipakai; token hidup di CSS `@theme`.
3. `pnpm lint`, `typecheck`, `test:unit`, `test:scripts`, `docs:api:check`, `build`,
   `e2e` hijau.
4. Diff visual: **setiap** state identik atau selisihnya dijelaskan di PR — tidak ada
   "kira-kira mirip".
5. `main` = npm setelah rilis, dan app sudah memakai versi baru tanpa regresi tampilan.
6. Entri `ignore` Tailwind dihapus dari Dependabot sehingga update berikutnya normal.

## 6. Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Perubahan default utility lolos tanpa terlihat | diff piksel 5 state (§3) |
| Kelas tidak terdeteksi di monorepo → utility hilang | `@source` eksplisit + bandingkan ukuran `dist/style.css` sebelum/sesudah (penurunan drastis = ada yang hilang) |
| Plugin/ekosistem belum kompatibel | Tailwind 4 dipakai tanpa plugin (`plugins: []` hari ini), jadi permukaannya kecil |
| Migrasi memakan waktu dan bercabang jauh dari `main` | dikerjakan di branch `chore/215-tailwind-4`; merge dari `origin/main` berkala, tanpa rebase + force-push |
| Hasil buruk di tengah jalan | branch dibuang; `main` tidak pernah menerima setengah migrasi karena gate visual + e2e harus hijau sebelum PR dibuka |

## 7. Perkiraan usaha

Fase B adalah pekerjaan sebenarnya (satu paket, satu entry CSS, tiga token, 233
arbitrary value untuk diperiksa). Fase C–D mekanis. Perkiraan: **1 sesi kerja fokus**
untuk B, **setengah sesi** untuk C–D, ditambah waktu tunggu rilis. Yang paling mahal
bukan menulis CSS-nya, melainkan men-triage diff visual — dan itulah bagian yang tidak
bisa dipercepat tanpa mengorbankan kejujuran hasil.

---

## 8. Hasil migrasi (terukur)

Dikerjakan pada branch `chore/215-tailwind-4`, dibandingkan dengan baseline `main`
sebelum dependensi disentuh.

| Ukuran | Sebelum (v3, `vue@0.0.129`) | Sesudah (v4) |
|---|---|---|
| `dist/style.css` | 77.895 byte | 99.976 byte (+28%; v4 mengeluarkan `@property` + variabel tema) |
| `tailwind.config.js` | 3 file | 0 |
| Plugin PostCSS | `tailwindcss` + `autoprefixer` | `@tailwindcss/postcss` (autoprefixing ikut di dalamnya) |
| Gate | — | lint, typecheck, unit, `test:scripts` 64, `docs:api:check`, `dedupe --check`, build (dist + `PLAYGROUND_SOURCE=1`), e2e **26/26** |

**Diff visual:** kelima state berada di 0,036–0,040% (ambang 0,05%), jadi lolos — tetapi
angka itu 25× di atas noise floor (~20 px), sehingga tidak diterima begitu saja.
Analisis piksel menunjukkan penyebabnya satu: **v4 mengeluarkan warna dalam OKLCH**,
Chromium mengonversinya ke sRGB dengan pembulatan berbeda.

Buktinya bukan opini — jumlah piksel per warna dominan **identik** sebelum dan sesudah:

```
header  : slate-800 7852 piksel (before) vs 7852 piksel (after)
toolbar : slate-900 2615 piksel (before) vs 2615 piksel (after)
```

Yang bergeser hanya warna sekunder di tepi antialias, mis. slate-600 `71,85,105`
(#475569) → `69,85,108`, blue-600 `37,99,235` → `21,93,252`. Geometri, tata letak, dan
warna yang dimaksud tidak berubah; e2e geometri (paginasi, lebar kolom tabel) juga
tetap hijau.

Perubahan default v4 yang dikhawatirkan di §2 (border `currentColor`, lebar `ring`)
**tidak** berdampak di sini karena kelas border di repo ini selalu menyebut warnanya
secara eksplisit — diperiksa lewat diff, bukan diasumsikan.

Sisa satu langkah: Fase E (verifikasi tampilan di `docflow-app` setelah versi baru
terbit).
