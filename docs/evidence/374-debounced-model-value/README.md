# Bukti: debounce `update:modelValue` (issue #374)

## 1. Masalah

Setiap transaksi ProseMirror memanggil `onUpdate(json)` →
`persistCurrentDoc()` → membangun ulang seluruh `TabbedDoc` dan memancarkan
`update:modelValue`. Mengetik 8 karakter/detik berarti 8 serialisasi, 8 salinan
dokumen, dan 8 update host per detik.

## 2. Perbaikan

- Emit saat mengetik dijadwalkan **trailing 300 ms**
  (`MODEL_UPDATE_DEBOUNCE_MS`), dan burst transaksi digabung menjadi satu emit.
- **Flush** saat editor kehilangan fokus (`blur`) dan saat komponen unmount,
  sehingga perubahan terakhir tidak hilang.
- Tulisan host (`modelValue` baru) **membatalkan** emit yang tertunda: snapshot
  lama tidak boleh mendarat setelah host mengganti dokumen.
- Perubahan diskret (header/footer, perintah edit) tetap emit **segera**;
  `savingStatus` menjadi `saving` begitu ada perubahan yang diantre, dan timer
  `saved` dari emit sebelumnya dibatalkan agar status tidak flip ke "saved"
  saat masih ada ketikan tertunda.
- Isi dokumen tetap diperbarui per transaksi (`tabContents`), jadi flush selalu
  membawa keadaan terbaru — yang di-debounce hanya pembangunan + emit payload.

## 3. Bukti Sebelum vs Sesudah

Pengukuran: satu burst berisi 3 `insertContent`, lalu dihitung jumlah emit pada
t=0, t=200 ms, dan t=350 ms; ditambah skenario blur dan unmount.

| Skenario | Sebelum (`main` @ `a042c87`) | Sesudah (branch) |
| --- | --- | --- |
| Burst 3 ketikan, emit t=0 | **3** | **0** |
| Burst 3 ketikan, emit t=200 ms | 3 | 0 |
| Burst 3 ketikan, emit t=350 ms | 3 | **1** |
| Ketik lalu blur | 1 sebelum blur (sudah ter-emit) | 0 sebelum blur → **1** setelah blur |
| Ketik lalu unmount | 1 sebelum unmount (sudah ter-emit) | 0 sebelum unmount → **1** saat unmount |

Log mentah ada di [`before-after.txt`](./before-after.txt).

Test regresi `packages/vue/src/__tests__/DocsEditor.emits.test.ts` (4 test):
di `main` gagal karena emit sudah terjadi sebelum debounce; di branch lulus.

## 4. Test & Verifikasi

```bash
pnpm --filter @kedata-indonesia/docflow-vue test:unit      # 45 file, 244 test
pnpm --filter @kedata-indonesia/docflow-vue typecheck      # bersih
pnpm --filter @kedata-indonesia/docflow-element test:unit  # 3 file, 14 test
npx eslint packages/vue/src --max-warnings 0               # exit 0
pnpm docs:api:check                                        # README sinkron
pnpm docs:check                                            # 43 file, tanpa link rusak
```

Test baru (7):

- `coalesces a burst of keystrokes into one trailing emit` — 0 emit sebelum
  300 ms, 1 emit sesudahnya, isi = ketikan terakhir.
- `flushes the pending document when the element unmounts`.
- `flushes the pending document when the editor loses focus` — blur DOM asli
  yang diteruskan ProseMirror/tiptap.
- `drops a queued edit when the host replaces the document` — host menulis
  `modelValue`, emit yang diantre dibatalkan, editor menampilkan dokumen host.
- `coalesces scheduled persists and flips saving → saved` — status `saving`
  segera saat antre, `saved` 800 ms setelah emit.
- `stays saving when a burst outlasts the previous saved timer` — timer
  "saved" dari emit sebelumnya dibatalkan saat ada antrean baru (tanpa fix ini
  test gagal: `expected 'saved' to be 'saving'`).
- `drops the queued emit when the host writes modelValue` — unit-level untuk
  pembatalan antrean + status kembali `saved`.

## 5. File yang Berubah

| File | Perubahan |
| --- | --- |
| `packages/vue/src/composables/useDocumentModel.ts` | Pipeline emit: `MODEL_UPDATE_DEBOUNCE_MS`, `schedulePersistCurrentDoc`, `flushPendingEmit`, pembatalan saat host menulis, status `saving` saat antre. |
| `packages/vue/src/composables/useDocsEditorSession.ts` | `onUpdate` memakai jadwal debounce; listener `blur` pada instance editor (di-detach saat re-init kolaborasi). |
| `packages/vue/src/__tests__/DocsEditor.emits.test.ts` | 4 test regresi debounce/flush/pembatalan. |
| `packages/vue/src/__tests__/useDocumentModel.debounce.test.ts` | 3 test unit: antrean, status `saving`/`saved`, pembatalan oleh tulisan host. |
| `packages/vue/src/__tests__/DocsEditor.modelValue.test.ts` | Menunggu emit trailing sebelum membaca payload. |
| `packages/vue/src/components/docsEditorContracts.ts` | JSDoc `modelValue` menjelaskan debounce + flush. |
| `README.md`, `docs/guides/INTEGRATION.md` | Dokumentasi perilaku emit. |
| `CHANGELOG.md` | Entri Unreleased → Changed. |

## 6. Cara Uji untuk QA

1. Jalankan playground, buka dokumen panjang, buka DevTools dan pasang
   `onUpdate`/`v-model` host untuk menghitung event.
2. Ketik cepat beberapa detik: host menerima **satu** update setelah berhenti
   (~300 ms), bukan satu per karakter.
3. Klik di luar editor saat masih ada ketikan tertunda: update host langsung
   masuk (flush blur).
4. Ketik lalu segera pindah/teardown komponen: dokumen terakhir tetap diterima
   host (flush unmount).
5. Ketik lalu pulihkan snapshot dari version history: editor menampilkan
   snapshot host, dan tidak ada snapshot lama yang muncul kembali ~300 ms
   kemudian.
6. Indikator simpan: berubah ke "saving" saat mengetik, lalu "saved" sekitar
   800 ms setelah emit terakhir.

## 7. Catatan / Batas

- `createEditor` di core masih memanggil `editor.getJSON()` per transaksi
  (`packages/core/src/Editor.ts`). Perbaikan ini menghilangkan pembangunan
  ulang + emit payload per ketikan; menghapus serialisasi di core butuh opsi
  API baru dan berada di luar scope issue ini.
- Flush mengandalkan event `blur` tiptap. Jika host mematikan fokus editor
  secara programatik tanpa event blur, unmount tetap menjadi jaring pengaman.
