# Bukti perbaikan — `<docs-editor>` kehilangan editan saat dipindah (`#392`)

Dokumen ini merekam bukti perbaikan state pada custom element `@kedata-indonesia/docflow-element`.

- **Base**: `main` @ `76bd7c2`
- **Head**: `fix/392-element-reconnect-state`
- **Issue**: [#392](https://github.com/Kedata-Indonesia/docflow/issues/392)

## 1. Masalah

`connectedCallback()` selalu membangun ulang editor dari atribut `content`. Host yang memakai
`<docs-editor content="…">` tidak menulis balik atribut itu saat pengguna mengetik, sehingga
begitu elemen dilepas dan dipasang lagi (modal, tab, drag-and-drop), instance Vue baru dibuat
dari dokumen lama — editan hilang tanpa peringatan.

## 2. Sebelum vs Sesudah

Test yang sama dijalankan terhadap kode `main` (sebelum) dan kode branch (sesudah):

| Test | `main` | Branch |
| --- | --- | --- |
| `keeps unsaved edits when the editor is moved` | **gagal** — `modelValue` kembali ke isi atribut `content` | lulus |
| `keeps edits when plugins are replaced after mount` | **gagal** — setter `plugins` juga membangun ulang dari atribut | lulus |
| `captures documents emitted through the Vue wrapper` | **gagal** — dokumen hasil `emit` diabaikan | lulus |
| `lets a rewrite made while detached win over cached edits` | lulus (trivial, kode lama selalu membaca atribut) | lulus |
| `lets a host rewrite of content win over cached edits` | lulus (trivial) | lulus |
| Dua test lifecycle lama | lulus | lulus |

Keluaran terminal lengkap: [`before-after.txt`](./before-after.txt).

```
# sebelum
× keeps unsaved edits when the editor is moved
  → expected { type: 'doc', …(1) } to deeply equal { type: 'tabbed-doc', …(2) }
× captures documents emitted through the Vue wrapper
  → expected { type: 'doc', …(1) } to deeply equal { marker: 'clicked', …(1) }
Tests  3 failed | 4 passed (7)

# sesudah
Tests  7 passed (7)
```

## 3. Perbaikan

`DocsEditorElement` sekarang menyimpan dokumen terakhir yang dipancarkan editor:

- Mendengarkan event `update:modelValue` dari elemen Vue internal (dipancarkan setiap
  `persistCurrentDoc()`), menyimpan payload di `_modelValue`.
- `_currentModelValue()` memakai nilai itu selama atribut `content` **tidak berubah** sejak
  sinkronisasi terakhir; bila host menulis ulang atribut — termasuk saat elemen sedang
  dilepas — atribut menang dan menjadi baseline baru.
- Cache yang sama dipakai oleh setter `plugins`/`onImageUpload` dan `attributeChangedCallback`,
  jadi perubahan prop tidak lagi mengembalikan dokumen ke isi atribut yang basi.

Catatan: event `update:modelValue` dari wrapper Vue membawa argumen emit sebagai array di
`detail`, sehingga dokumen diambil dari `detail[0]`. Ini terdokumentasi di komentar metode dan
dikunci oleh test — termasuk test yang memakai `emit` Vue sungguhan lewat stub komponen, bukan
event yang dirakit manual.

## 4. Perubahan file

- `packages/element/src/DocsEditorElement.ts` — cache dokumen + listener event + `_parseContent()`.
- `packages/element/src/__tests__/reconnect.test.ts` — 5 test baru; mock `DocsEditor` kini
  mendeklarasikan props dan benar-benar memancarkan `update:modelValue` lewat tombol, sehingga
  bentuk dispatch Vue ikut teruji.
- `CHANGELOG.md` — entri `[Unreleased] → Fixed`.

## 5. Cara memverifikasi

```bash
pnpm --filter @kedata-indonesia/docflow-element test:unit   # 2 file, 13 test lulus
pnpm --filter @kedata-indonesia/docflow-element typecheck   # bersih
npx eslint packages/element/src --max-warnings 0            # exit 0
```

Uji manual:

1. Pasang `<docs-editor content='{"type":"doc","content":[…] }'>`.
2. Ketik teks tambahan tanpa menulis balik atribut `content`.
3. `el.remove()` lalu `document.body.append(el)`.
4. Teks tambahan harus tetap ada. Setelah itu set `el.setAttribute('content', …)` dan pastikan
   dokumen berganti ke nilai atribut tersebut.
