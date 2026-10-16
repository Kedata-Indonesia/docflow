# Bukti — penandaan `sideEffects` per paket (`#172`)

Sebelum perubahan, **tidak satu pun** dari 6 `package.json` paket punya field `sideEffects`,
sehingga bundler konsumen menganggap setiap modul punya efek samping dan tidak berani membuang
kode yang tidak terpakai. Dokumen ini merekam dasar keputusan nilainya per paket, hasil
pengukuran bundel, dan verifikasi bahwa build contoh tetap berfungsi.

- **Base**: `main` @ `0ddf59e`
- **Head**: `chore/172-side-effects`
- **Ringkas**: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (442 lulus), `pnpm test:scripts`,
  `pnpm docs:api:check` hijau; build `examples/playground` **byte-identik** sebelum vs sesudah.

## 1. Audit efek samping saat import (dasar penentuan nilai)

| Paket | `sideEffects` | Dasar |
| --- | --- | --- |
| `core` | `false` | Entry hanya barrel (`export … from`). Tidak ada mutasi prototype/global. `document.body.appendChild` & `globalThis.localStorage` hanya dipanggil **di dalam** fungsi/class (`PerformanceMonitor`, `ManualColumnResize`, `ai/keyStorage`). |
| `layout-engine` | `false` | Murni fungsi perhitungan layout + konstanta. Tidak ada akses DOM di module scope. |
| `export` | `false` | Murni fungsi konversi. `const SUGGESTION_MARKS = new Set([...])` — konstruksi nilai, bukan efek samping. |
| `plugins` | `false` | Barrel + konstanta (`new Set(...)`, `new PluginKey('docflow/table-page-split')`). Subpath `./citations` (594 KB) adalah entry terpisah, tidak diimpor barrel. |
| `vue` | `["**/*.css"]` | Satu-satunya efek samping: `packages/vue/src/index.ts:1` → `import './styles/index.css'`, dan `dist/style.css` diekspos lewat subpath publik `./style.css`. |
| `element` | `["**/*.css"]` | Build Vite men-*emit* `dist/index.css`. CSS Shadow DOM di-*inline* jadi string saat build (`./shadow.css?inline`) — efeknya terjadi saat elemen dibuat, **bukan** saat import. Tidak ada `customElements.define` otomatis: registrasi hanya lewat `registerDocsEditor()` yang dipanggil host. |

`false` dipilih hanya untuk paket yang lolos audit di atas; `vue`/`element` sengaja memakai
allowlist CSS, bukan `false`, supaya stylesheet yang diimpor konsumen tidak pernah dianggap
"boleh dibuang".

## 2. Pengukuran bundle `examples/playground` (DoD butir 3)

Metode: build paket dari source yang sama (`pnpm -r --filter "./packages/*" run build`), lalu
`examples/playground` di-build dua kali hanya dengan perbedaan field `sideEffects`.

| | Sebelum (tanpa `sideEffects`) | Sesudah | Delta |
| --- | --- | --- | --- |
| JS | 3.085.760 B — `assets/index-DXC_KHBP.js` | 3.085.760 B — `assets/index-DXC_KHBP.js` | 0 |
| CSS | 82.655 B — `assets/index-BIcSz8uM.css` | 82.655 B — `assets/index-BIcSz8uM.css` | 0 |
| Total `dist` | 3.168.817 B | 3.168.817 B | 0 |

Nama berkas ber-*hash* **sama persis**, jadi hasilnya bukan sekadar "mirip": output-nya
byte-identik. Penyebabnya auditable:

- `examples/playground` mengimpor seluruh permukaan publik, sehingga tidak ada modul yang bisa
  dibuang — `sideEffects` hanya membantu ketika ada modul/subpath yang tidak dipakai.
- Tiap paket terbit sebagai **satu berkas entry** hasil pre-bundle, jadi granularitas tree-shaking
  di sisi konsumen kecil. `packages/vue/dist/index.js` bahkan 2,17 MB karena membundel
  `@kedata-indonesia/docflow-plugins` + `lucide-vue-next` (bukan `external` di
  `packages/vue/vite.config.ts`).

### Probe konsumen: import satu simbol

Diukur dengan esbuild (`--bundle --minify`) dari entry yang hanya mengimpor satu helper:

```
$ esbuild narrow.mjs --bundle --minify --format=esm
// narrow.mjs: import { getSupportedLocales } from '@kedata-indonesia/docflow-vue'
→ 1.721.235 B (1.680 KB)
```

Satu helper kecil tetap menarik ±1,7 MB. Inilah bukti bahwa **`sideEffects` saja tidak bisa
mengecilkan bundel konsumen selama entry masih satu berkas besar**: field ini adalah prasyarat
yang membuka jalan, sedangkan pemangkasan `external` (#168) adalah pekerjaan yang membuatnya
terasa. Temuan ini dilaporkan apa adanya di PR/issue, bukan diklaim sebagai penghematan.

Probe kedua (konsumen yang hanya mengimpor `@kedata-indonesia/docflow-vue/style.css`) juga
menghasilkan output identik dengan `["**/*.css"]` maupun `false` karena Vite menandai modul CSS
sebagai punya efek samping; nilai allowlist CSS tetap dipakai karena bundler lain (mis. Webpack
dengan `mini-css-extract-plugin`) memang menghormati field ini secara ketat.

## 3. Verifikasi build contoh tetap berfungsi (DoD butir 2)

`examples/playground/dist` disajikan dengan `vite preview` lalu diperiksa dengan Chrome
(Playwright) — lihat [`playground-preview.png`](./playground-preview.png).

| Yang diperiksa | Hasil |
| --- | --- |
| Editor ter-mount | `.ProseMirror` ada, tinggi kertas 1238 px (`.docs-editor__paper`) |
| CSS editor tidak hilang | stylesheet `assets/index-BIcSz8uM.css` ter-load; `font-family` `.ProseMirror` = `Inter, ui-sans-serif, …` (Tailwind/docflow aktif) |
| Pagination tetap aktif | `div[data-rm-pagination="true"].rm-pages-wrapper` + `div.rm-page-break` + 2 × `.rm-page-footer` |
| Editor benar-benar hidup | mengetik teks nyata lalu `Ctrl+B` → `strong` = 1 di DOM |
| Error konsol | hanya `favicon.ico` 404 (sudah ada sebelum perubahan, tidak terkait) |

## Cara verifikasi ulang

```bash
pnpm -r --filter "./packages/*" run build
(cd examples/playground && pnpm build && pnpm preview)   # http://localhost:4173
```

1. Buka <http://localhost:4173/> → halaman kertas tampil dengan gaya docflow dan footer halaman.
2. Klik di dalam editor, ketik teks, tekan `Ctrl+B` → teks menjadi tebal (plugin & keymap hidup).
3. Scroll dokumen sampai melewati satu halaman → penanda halaman/footer pagination bertambah.
4. Bandingkan ukuran: `ls -l examples/playground/dist/assets` sebelum vs sesudah perubahan
   manifest (harus sama, termasuk hash berkas).
