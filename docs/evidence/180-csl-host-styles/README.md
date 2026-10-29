# Bukti — Host bisa mendaftarkan gaya CSL sendiri (`#180`)

Sebelum perbaikan, daftar gaya sitasi **dikunci** di dua tempat: `CiteEngine` mem-
validasi terhadap konstanta `CSL_STYLES`, dan sidebar Referensi menyimpan daftar
4 gaya sebagai konstanta di komponennya. Host yang butuh gaya institusi
(Harvard/IEEE/gaya kampus) harus fork library.

- **Base**: `main` @ `8b5a941`
- **Head**: `feat/180-registrable-csl-styles`

## Perubahan

| Lapisan | Sebelum | Sesudah |
| --- | --- | --- |
| Registry engine | `CSL_STYLES` saja (konstanta modul) | `resolveCslStyles(CitationPort.styles)` — gaya bawaan + injeksi host; id yang sama menimpa |
| API port | `{ sources, style }` | `+ styles?: CslStyleInfo[]` (dideklarasikan di `packages/core/src/ports.ts`) |
| Daftar gaya di UI | konstanta 4 gaya di `ReferencesSidebar.vue` | `CiteEngine.getAvailableStyles()` → diteruskan `useCitations` → `DocsEditorSidebars` → sidebar |
| Gaya tak dikenal | fallback ke `DEFAULT_CSL_STYLE` | tetap sama (tidak blank, tidak throw) |
| Bundling | 4 gaya XML selalu ikut bundle (offline) | tidak berubah — default tetap offline, `styles` hanya menambah |

## Bukti di demo (playground, mode source, `:5200`)

`examples/playground/src/App.vue` sekarang meng-inject satu gaya contoh
(`harvard-demo`, didefinisikan di `fixtures/citations.ts`) lewat port — persis seperti
host nyata. Hasil terukur di browser Chrome headless:

```
[engine]  styleIds = [apa, chicago-author-date, chicago-notes-bibliography, harvard-demo, modern-language-association]
[picker]  options = [apa, chicago-author-date, chicago-notes-bibliography,
                     "Harvard (demo — injected by the host)", modern-language-association]
[switch]  selectOption('harvard-demo') → engine.getStyle() === 'harvard-demo'
```

- Sebelum: picker hanya punya 4 opsi bawaan dan `setStyle('harvard-demo')` akan
  menjadi no-op (id tidak dikenal → diabaikan).
- Sesudah: opsi ke-5 muncul di picker sidebar Referensi dan bisa dipilih.

Berkas bukti:

| Berkas | Isi |
| --- | --- |
| `picker-shows-injected-style.png` | Sidebar Referensi dengan dropdown **CITATION STYLE** pada "Harvard (demo — injected by the host)". |

## Gerbang mutu

| Perintah | Hasil |
| --- | --- |
| `pnpm lint` | bersih |
| `pnpm typecheck` | bersih (semua paket + playground) |
| `pnpm test:coverage` | lulus — 457 tes (plugins 123, vue 145, core 130, export 32, layout-engine 21, element 6) |
| `pnpm test:scripts` | 56 lulus |
| `pnpm docs:api:check` | README API up to date |
| `pnpm test:e2e` | 17 lulus |
| `pnpm build` | bersih |

Tes baru: 7 di `packages/plugins/src/__tests__/citeEngine.test.ts` (render dengan gaya
host, gaya bawaan tetap ada, override per-id, fallback gaya tak dikenal, kategori
note/in-text, gaya malformed ditolak dengan pesan yang menyebut id-nya, tidak ada
registry global antar-engine) + 3 di `packages/vue/src/__tests__/useCitations.styles.test.ts`
(daftar dari engine, fallback tanpa registry, fallback sebelum editor mount) + 1 di
`DocsEditorSidebars.test.ts` (penerusan daftar ke picker).

## Catatan cakupan (belum dikerjakan di PR ini)

Issue #180 juga menyebut dua hal yang **belum** disentuh di sini dan tetap berlaku:

1. **Ukuran bundle (~595 KB XML, poin 3 issue):** XML gaya masih berupa satu string
   raksasa satu-baris di `packages/plugins/src/csl/*.ts`, dan `dist` tetap membawa
   keempatnya. Usulan "pindahkan ke aset `.csl` + pretty-print" butuh perubahan build
   (`tsup` loader) dan menyentuh `publish.yml` (lihat #173 soal cakupan rewrite) —
   lebih baik PR tersendiri.
2. **Lazy-load per gaya (poin 2 issue):** belum ada; host yang ingin ringan masih
   mengangkut 4 gaya bawaan. `styles` memberi jalur injeksi, bukan jalur pengurangan.

Keduanya sengaja tidak digabung agar PR ini tetap satu perhatian.
