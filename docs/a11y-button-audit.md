# Audit nama aksesibel tombol — `packages/vue/src/components`

Audit untuk issue **#170**. Angka di issue diverifikasi ulang terhadap kode hari ini; hasilnya mengubah besar pekerjaannya, jadi dokumen ini menjadi acuan, bukan isi issue.

## Ringkasan

| Kategori | Jumlah | Arti |
|---|---|---|
| Tombol mentah `<button>` | **125** | total di `packages/vue/src/components/**/*.vue` |
| Sudah bernama (`aria-label`/`aria-labelledby`) | **23** | sudah benar |
| Bertombol teks terlihat | **71** | nama aksesibel dari teksnya, tidak perlu `aria-label` |
| Hanya `title` | **22** | nama rapuh: tidak konsisten dibacakan, hilang saat `title` dihapus |
| Tanpa nama sama sekali | **9** | **kegagalan WCAG 4.1.2** — ini yang paling mendesak |

**Yang benar-benar perlu dikerjakan: 31 tombol di 14 file** (9 tanpa nama + 22 hanya `title`), bukan 125.

## Koreksi premis issue

Issue menyebut `EditorToolbar.vue` sebagai sumber terbanyak (**25** `<button>`). Diukur ulang, **tidak ada satu pun** dari 25 tombol itu yang bermasalah — semuanya bertombol teks atau sudah bernama. Sebaran masalah sesungguhnya ada di sidebar dan dialog:

```
25 |  0 |  0   packages/vue/src/components/EditorToolbar.vue
15 |  2 |  6   .../sidebars/ReferencesSidebar.vue
11 |  0 |  4   packages/vue/src/components/HeaderBar.vue
 8 |  1 |  3   .../DocumentTabsSidebar.vue
 7 |  1 |  2   .../sidebars/CommentsSidebar.vue
 7 |  0 |  0   .../sidebars/HistorySidebar.vue
 6 |  0 |  0   .../sidebars/AISidebar.vue
 5 |  0 |  0   packages/vue/src/components/BubbleMenu.vue
 5 |  0 |  3   packages/vue/src/components/FindReplaceDialog.vue
 5 |  0 |  0   .../sidebars/SuggestionsSidebar.vue
 4 |  1 |  0   packages/vue/src/components/ColorPickerDropdown.vue
 4 |  1 |  0   packages/vue/src/components/LinkDialog.vue
 4 |  0 |  0   packages/vue/src/components/PageSetupDialog.vue
 4 |  1 |  1   .../sidebars/TOCSidebar.vue
 3 |  1 |  1   packages/vue/src/components/EmailDialog.vue
 3 |  0 |  0   packages/vue/src/components/FooterDialog.vue
 2 |  0 |  1   packages/vue/src/components/DocsEditor.vue
 2 |  0 |  0   packages/vue/src/components/HeaderFormatDialog.vue
 2 |  0 |  0   packages/vue/src/components/PageNumberDialog.vue
 1 |  1 |  0   packages/vue/src/components/DetailsDialog.vue
 1 |  0 |  0   packages/vue/src/components/SlashMenu.vue
 1 |  0 |  1   packages/vue/src/components/ThemeToggle.vue
    kolom: total | tanpa nama | hanya title
```

## Daftar 31 tombol yang perlu diperbaiki

`[unnamed]` = tidak ada nama aksesibel; `[title]` = hanya `title`.

```
ColorPickerDropdown.vue:94                  [unnamed]
DetailsDialog.vue:34                        [unnamed]
DocumentTabsSidebar.vue:204                 [unnamed]
EmailDialog.vue:83                          [unnamed]
LinkDialog.vue:98                           [unnamed]
sidebars/CommentsSidebar.vue:214            [unnamed]
sidebars/ReferencesSidebar.vue:320          [unnamed]
sidebars/ReferencesSidebar.vue:538          [unnamed]
sidebars/TOCSidebar.vue:206                 [unnamed]

DocsEditor.vue:261                          [title]
DocumentTabsSidebar.vue:140                 [title]
DocumentTabsSidebar.vue:155                 [title]
DocumentTabsSidebar.vue:272                 [title]
EmailDialog.vue:103                         [title]
FindReplaceDialog.vue:129                   [title]
FindReplaceDialog.vue:138                   [title]
FindReplaceDialog.vue:147                   [title]
HeaderBar.vue:279                           [title]
HeaderBar.vue:313                           [title]
HeaderBar.vue:520                           [title]
HeaderBar.vue:594                           [title]
ThemeToggle.vue:11                          [title]
sidebars/CommentsSidebar.vue:147            [title]
sidebars/CommentsSidebar.vue:156            [title]
sidebars/ReferencesSidebar.vue:284          [title]
sidebars/ReferencesSidebar.vue:329          [title]
sidebars/ReferencesSidebar.vue:391          [title]
sidebars/ReferencesSidebar.vue:399          [title]
sidebars/ReferencesSidebar.vue:438          [title]
sidebars/ReferencesSidebar.vue:484          [title]
sidebars/TOCSidebar.vue:187                 [title]
```

## Tindakan yang disarankan

1. **9 `[unnamed]`** → `aria-label` dari locale (`packages/vue/src/locales/en.ts` dan `id.ts`), bukan string hardcoded, supaya ikut i18n. Tombol tutup/clear cukup `a11y.close` / `a11y.clearSearch`; tombol yang punya `title` di dekatnya memakai teks yang sama.
2. **22 `[title]`** → tambahkan `aria-label` dengan teks yang sama seperti `title`, dan **pertahankan `title`** sebagai tooltip. Ini menghilangkan ketergantungan pada `title` sebagai nama tanpa mengubah tampilan.
3. **Toggle dan dropdown** (ThemeToggle, ColorPicker, DocumentTabs, menu di HeaderBar) → selain nama, perlu `aria-pressed` untuk tombol toggle dan `aria-expanded` + `aria-haspopup` untuk pemicu yang membuka popup. Ini tidak tertangkap oleh hitungan nama di atas, jadi harus diperiksa per komponen.
4. **Axe gate**: belum ada `axe` di repo ini (root maupun `packages/vue`). Untuk mencapai kriteria uji otomatis, tambahkan `@axe-core/playwright` sebagai devDependency dan satu spec di `e2e/library` yang memeriksa halaman showcase + harness editor, dengan ambang `serious`/`critical`.

## Revisi Definisi Selesai #170

Kriteria lama tidak bisa dipakai apa adanya:

- ~~"Ganti `<button>` mentah dengan komponen Design System (`UiButton`)"~~ — **tidak ada komponen Design System di workspace ini** (`packages/vue/src`, `packages/element/src`: nol referensi `UiButton`). Kriteria ini diganti.
- Kriteria baru:
  - [ ] 0 tombol `[unnamed]` di `packages/vue/src/components`
  - [ ] 0 tombol ikon yang hanya mengandalkan `title` (setiap `title` ikon punya pasangan `aria-label`)
  - [ ] Toggle punya `aria-pressed`; pemicu popup punya `aria-expanded`/`aria-haspopup`
  - [ ] Spec axe di `e2e/library` lulus tanpa violation `serious`/`critical`
  - [ ] Audit ulang (skrip di lampiran) menunjukkan angka di atas menjadi 0

## Rencana kerja

| Fase | Isi | Ukuran |
|---|---|---|
| 1 | 9 `[unnamed]` → `aria-label` + key locale `en`/`id` | kecil, risiko rendah (atribut saja) |
| 2 | 22 `[title]` → `aria-label` + pertahankan `title` | kecil, mekanis |
| 3 | `aria-pressed`/`aria-expanded` untuk toggle & popup + spec axe di `e2e/library` | sedang, perlu `@axe-core/playwright` |

Risiko utama bukan teknis: menambah atribut tidak mengubah tampilan, tetapi menambah key locale berarti dua file locale harus sinkron, dan spec axe menambah waktu CI beberapa detik.

## Lampiran — cara mengukur ulang

Aturan klasifikasi (konservatif): `named` bila tag punya `aria-label`/`:aria-label`/`aria-labelledby`; `text` bila ada teks terlihat di antara `<button>` dan `</button>`; `title-only` bila tanpa nama tapi punya `title`; sisanya `unnamed`.

```python
import pathlib, re
ROOT = pathlib.Path("packages/vue/src/components")
tag_re = re.compile(r"<button\b", re.I)
close_re = re.compile(r"</button>", re.I)
attr_re = re.compile(r"""(?P<n>[\w:@.-]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?""")
counts = {"named": 0, "text": 0, "title-only": 0, "unnamed": 0}
for path in sorted(ROOT.rglob("*.vue")):
    text = path.read_text(encoding="utf8")
    for m in tag_re.finditer(text):
        end = text.find(">", m.start())
        if end == -1:
            continue
        tag = text[m.start():end + 1]
        close = close_re.search(text, end)
        inner = text[end + 1:close.start()] if close else ""
        attrs = {a.group("n").lower() for a in attr_re.finditer(tag)}
        named = any(k in attrs for k in ("aria-label", ":aria-label", "aria-labelledby"))
        visible = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", inner)).strip()
        kind = "named" if named else "text" if visible else "title-only" if ("title" in attrs or ":title" in attrs) else "unnamed"
        counts[kind] += 1
        if kind in ("unnamed", "title-only"):
            print(f"{path}:{text.count(chr(10), 0, m.start()) + 1} [{kind}]")
print(counts)
```

Jalankan dari root repo. Angka acuan dokumen ini: `named 23, text 71, title-only 22, unnamed 9` (total 125).
