# Bukti perbaikan — RTF escaping (`#368`)

Dokumen ini merekam bukti byte-level perbaikan RTF export pada `@kedata-indonesia/docflow-export`.

- **Base**: `main` @ `046d577`
- **Head**: `fix/368-rtf-escaping`
- **Issue**: [#368](https://github.com/Kedata-Indonesia/docflow/issues/368)

## 1. Masalah

Header RTF mendeklarasikan `\ansicpg1252` (Windows Latin-1), tetapi `generateRtf` menulis teks
apa adanya sebagai UTF-8 ke dalam `Blob`. Pembaca RTF lalu menafsirkan byte UTF-8 sebagai
Latin-1, sehingga teks rusak. Judul dokumen juga disisipkan mentah ke header, jadi `{` atau `\`
di judul merusak struktur group dan Word bisa menolak membuka file.

## 2. Perbandingan Sebelum vs Sesudah

Input yang dipakai di kedua sampel:

- Judul: `Laporan {Q3} — café`
- Isi: `<p>— “kutipan” café 😀</p>`

| Karakter / bagian | Sebelum (`before.rtf`) | Sesudah (`after.rtf`) |
| --- | --- | --- |
| `—` (em dash) | `e2 80 94` (UTF-8 dibaca sebagai Latin-1 → `â€”`) | `\u8212?` (`5c 75 38 32 31 32 3f`) |
| `é` (café) | `c3 a9` → `cafÃ©` | `\u233?` (`5c 75 32 33 33 3f`) |
| `😀` | `f0 9f 98 80` → empat karakter sampah | `\u-10179?\u-8704?` (`5c 75 2d 31 30 31 37 39 3f 5c 75 2d 38 37 30 34 3f`) |
| `“` / `”` | `e2 80 9c` / `e2 80 9d` | `\u8220?` / `\u8221?` |
| `{` `}` di judul | mentah → group RTF rusak | `\{` `\}` |
| Baris yang mengandung byte > `0x7F` | 2 | 0 |

Sampel lengkap:

- [`before.rtf`](./before.rtf) — keluaran generator lama
- [`after.rtf`](./after.rtf) — keluaran generator sekarang

## 3. Cara memverifikasi

```bash
# Tidak ada byte di atas 0x7F pada keluaran baru
LC_ALL=C grep -c $'[\x80-\xFF]' docs/evidence/368-rtf-escaping/after.rtf   # 0
LC_ALL=C grep -c $'[\x80-\xFF]' docs/evidence/368-rtf-escaping/before.rtf  # 2

# Unit test
pnpm --filter @kedata-indonesia/docflow-export test:unit
```

Buka kedua file di Word/LibreOffice: `before.rtf` menampilkan `â€”`, `cafÃ©`, `ð��` dan judul
`Laporan {Q3}` yang dapat merusak header; `after.rtf` menampilkan `—`, `café`, `😀`, dan judul
`Laporan {Q3}` dengan benar.

## 4. Hasil test

```
✓ src/__tests__/rtf.test.ts (6 tests)
Test Files  8 passed (8)
Tests       49 passed (49)
```

Enam test baru mencakup: escape karakter kontrol RTF, dash/kutipan melengkung/aksen,
surrogate pair emoji, judul berisi brace dan backslash, line break menjadi `\par`, serta
invarian bahwa seluruh keluaran RTF hanya berisi ASCII.
