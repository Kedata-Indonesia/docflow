# Bukti perbaikan — `<docs-editor>` mounting & reconnect (`#369`)

Dokumen ini merekam bukti visual dan laporan eksekusi perbaikan bug pada `<docs-editor>` (`@kedata-indonesia/docflow-element`).

- **Base**: `main` @ `67b76b0`
- **Head**: `fix/issue-369-fix-element-docs-editor-throws`
- **PR**: [#389](https://github.com/Kedata-Indonesia/docflow/pull/389)
- **Issue**: [#369](https://github.com/Kedata-Indonesia/docflow/issues/369)

## 1. Perbandingan Sebelum vs Sesudah

| Keadaan | Keterangan | Screenshot |
| --- | --- | --- |
| **Sebelum** | Wrapper tidak pernah render. `new VueDocsEditorElement(props)` melempar `Illegal constructor` karena class-nya belum terdaftar, dan `attachShadow()` kedua kali saat elemen dipindah melempar `NotSupportedError`. | [`before.png`](./before.png) (`innerMounted=false`, `editorText=false`) |
| **Sesudah** | Editor render, dipindah (`remove()` + `append()`) tanpa error, shadow root dipakai ulang dan diisi ulang dengan `<style>` + instance editor baru. | [`after.png`](./after.png) (`innerMounted=true`, `editorText=true`, `proseMirror=true`) |

Laporan harness di `after.png` dibaca berurutan:

```
mount ok: shadowRoot=true children=2
reconnect ok (no throw)
sameShadowRoot=true
children=2
innerTag=docflow-docs-editor-internal
registered=true
innerMounted=true
editorText=true
proseMirror=true
control throws on second attachShadow: NotSupportedError
```

Baris terakhir adalah kontrol: kode lama (`attachShadow` dua kali pada host yang sama) tetap melempar `NotSupportedError`, jadi harness memang bisa mendeteksi bug aslinya.

## 2. Yang diubah

- `registerVueElement()` mendaftarkan class hasil `defineCustomElement` ke tag internal
  `docflow-docs-editor-internal` (ditambah suffix `-1`, `-2`, … kalau halaman sudah
  memakai nama itu). Setelah terdaftar, `new VueDocsEditorElement(props)` legal dan
  props bisa langsung diberikan lewat constructor.
- `_ensureShadowRoot()` membuat shadow root sekali lalu memakai ulang
  (`this._shadowRoot ??= this.shadowRoot ?? this.attachShadow(...)`), sehingga
  reconnect tidak memanggil `attachShadow()` untuk kedua kalinya.
- `connectedCallback()` mengosongkan isi shadow root (`replaceChildren()`) sebelum
  menyuntik `<style>` dan instance editor yang baru; `disconnectedCallback()` hanya
  melepas instance Vue.
- `packages/element/src/__tests__/reconnect.test.ts` menguji mount → disconnect →
  reconnect, termasuk memastikan shadow root yang dipakai tetap sama.

## 3. Cara menguji

1. `pnpm --filter @kedata-indonesia/docflow-element test:unit`
2. Di browser (Chromium), buat elemen turunan `DocsEditorElement`, isi atribut
   `content` dengan dokumen ProseMirror sederhana, lalu `document.body.append(el)`.
3. `el.remove()`, tunggu, lalu `document.body.append(el)` lagi.
4. Harapan: tidak ada error di console, `el.shadowRoot.children.length === 2`,
   host Vue berada di `shadowRoot.children[1]` dengan tag
   `docflow-docs-editor-internal`, dan teks dokumen terlihat di dalam `.ProseMirror`.
