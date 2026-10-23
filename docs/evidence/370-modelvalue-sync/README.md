# Bukti perbaikan — `v-model` satu arah setelah mount (`#370`)

Dokumen ini merekam bukti bahwa tulisan host ke `modelValue` kini sampai ke editor.

- **Base**: `main` @ `175f19d`
- **Head**: `fix/370-modelvalue-sync`
- **Issue**: [#370](https://github.com/Kedata-Indonesia/docflow/issues/370)

## 1. Masalah

`modelValue` dibaca sekali saat setup lalu diteruskan ke `createEditor` sebagai isi awal, dan
tidak ada yang mengawasi `props.modelValue` setelahnya. Akibatnya, setelah render pertama host
tidak bisa mengganti dokumen lewat API publik:

- **Version history** — `restore-snapshot` / `preview-snapshot` hanya bisa diterapkan host
  dengan menulis `modelValue`; tulisan itu no-op.
- **Ganti dokumen** — mengganti dokumen saat route berubah tetap menampilkan dokumen lama
  kecuali host me-remount dengan `:key` (tidak terdokumentasi).
- **Web component** — `content` ada di `observedAttributes` dan prop-nya diperbarui, tapi
  komponen Vue mengabaikan nilai baru.

## 2. Sebelum vs Sesudah

Test integrasi yang sama dijalankan terhadap kode `main` (sebelum) dan kode branch (sesudah):

| Test | `main` | Branch |
| --- | --- | --- |
| `replaces the document when the host writes modelValue` | **gagal** — teks tetap `Alpha`, `Bravo` tidak pernah muncul | lulus |
| `applies a host write that reverts to an older emitted document` | **gagal** — `Bravo` tetap tampil | lulus |
| `applies header/footer slots carried by a tabbed document` | **gagal** — `userHeaderLeft` tetap kosong | lulus |
| `switches to the active tab of a host-written tabbed document` | **gagal** — tab aktif tidak berpindah | lulus |
| `replaces the rendered document without a remount` (web component, `content` ditulis ulang saat terpasang) | **gagal** — dokumen baru tidak pernah dirender (`timeout`) | lulus |
| `keeps the caret when a v-model host echoes the emitted document` | lulus (trivial, kode lama tidak pernah menerapkan apa pun) | lulus |
| 7 unit test `useModelValueSync` (guard, tulisan pra-mount, header/footer, kolaborasi) | — (modul baru) | lulus |

Keluaran terminal lengkap: [`before-after.txt`](./before-after.txt).

```
# sebelum
× replaces the document when the host writes modelValue
  → expected 'Alpha' to contain 'Bravo'
× applies a host write that reverts to an older emitted document
  → expected 'typedAlpha' to contain 'Bravo'
× applies header/footer slots carried by a tabbed document
  → expected '' to be 'Header dari host'
× switches to the active tab of a host-written tabbed document
  → expected 'Alpha' to contain 'Bravo'
Tests  4 failed | 1 passed (5)

# sesudah
Tests  12 passed (12)

# sebelum — web component (`content` ditulis ulang saat terpasang)
× replaces the rendered document without a remount
  → timeout waiting for the rewrite to render
Tests  1 failed (1)

# sesudah
Tests  1 passed (1)
```

## 3. Perbaikan

- `useModelValueSync` mengawasi `props.modelValue` dan menerapkan tulisan setelah mount dengan
  `editor.commands.setContent(content, { emitUpdate: false })`, sehingga host tidak menerima
  `update:modelValue` palsu atas nilainya sendiri.
- Guard terhadap loop `v-model`: dokumen yang persis sama dengan emisi terakhir komponen
  (`lastEmitted`, dibandingkan by-reference lalu by-JSON) dilewati. Selain itu isi yang sudah
  tampil di editor tidak di-`setContent` ulang, jadi kursor tidak melompat.
- `lastEmitted` juga diperbarui saat tulisan host diterapkan, sehingga host yang kembali ke
  dokumen lama (mis. undo perpindahan dokumen) tetap diterapkan, bukan disangka echo.
- Tab state ikut disinkronkan (`tabs`, `tabContents`, `activeTabId`), dan untuk dokumen
  bertipe `tabbed-doc` slot header/footer-nya dipasang kembali — snapshot restore tidak lagi
  kehilangan header/footer.
- Mode kolaborasi dilewati sepenuhnya: dokumen Yjs yang berwenang, bukan prop host.
- Tulisan yang tiba sebelum editor selesai mount tetap memperbarui model; editor lalu
  diinisialisasi dari konten tab aktif terbaru (bukan snapshot lama).
- Dokumen JSON biasa menyusutkan surface kembali menjadi satu tab (`tab-1`).
- Web component: `attributeChangedCallback` sudah memperbarui prop `modelValue` saat elemen
  terpasang, jadi dengan sync ini penulisan ulang `content` langsung diterapkan tanpa remount
  (diuji lewat custom element + shadow DOM asli).

## 4. Perubahan file

- `packages/vue/src/composables/useModelValueSync.ts` (baru) — watcher + guard + penerapan.
- `packages/vue/src/composables/useDocumentModel.ts` — `lastEmitted`, `applyModelValue()`
  (tab + header/footer), `isTabbedDoc()`.
- `packages/vue/src/composables/useDocsEditorSession.ts` — opsi `getModelValue` &
  `applyHeaderFooter`, pemasangan sync setelah editor dibuat.
- `packages/vue/src/components/DocsEditor.vue` — meneruskan getter prop + `applyHeaderFooterValues()`.
- `packages/vue/src/components/docsEditorContracts.ts` + `README.md` — dokumentasi prop
  (README di-generate ulang lewat `pnpm docs:api`).
- `docs/guides/INTEGRATION.md` — catatan `v-model` dua arah dan perilaku `content` web component.
- `packages/vue/src/__tests__/DocsEditor.modelValue.test.ts` (baru, 5 test integrasi).
- `packages/vue/src/__tests__/useModelValueSync.test.ts` (baru, 7 test unit).
- `packages/element/src/__tests__/content-live.test.ts` (baru, 1 test custom element + shadow DOM).
- `CHANGELOG.md` — entri `[Unreleased] → Fixed`.

## 5. Cara memverifikasi

```bash
pnpm --filter @kedata-indonesia/docflow-vue test:unit      # 43 file, 237 test
pnpm --filter @kedata-indonesia/docflow-vue typecheck      # bersih
pnpm --filter @kedata-indonesia/docflow-element test:unit  # 3 file, 14 test
npx eslint packages/vue/src --max-warnings 0               # exit 0
node scripts/check-docs-links.mjs                           # tanpa link rusak
pnpm docs:api:check                                         # README sinkron dengan kontrak
```

Uji manual:

1. Mount `<DocsEditor v-model="doc" />` dan ketik sesuatu.
2. Ganti `doc` dengan dokumen lain dari host (mis. hasil `restore-snapshot`).
3. Editor harus langsung menampilkan dokumen baru; kursor tidak melompat saat host hanya
   mengembalikan nilai yang baru saja dipancarkan editor.
4. Untuk web component: ubah `el.setAttribute('content', …)` saat elemen terpasang dan
   pastikan dokumen berganti tanpa remount.
