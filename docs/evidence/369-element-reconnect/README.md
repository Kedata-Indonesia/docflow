# Bukti perbaikan — `<docs-editor>` reconnect & mounting (`#369`)

Dokumen ini merekam bukti visual dan laporan eksekusi perbaikan bug pada `<docs-editor>` (`@kedata-indonesia/docflow-element`).

- **Base**: `main` @ `67b76b0`
- **Head**: `fix/369-element-attachshadow`
- **PR**: [#388](https://github.com/Kedata-Indonesia/docflow/pull/388)

## 1. Perbandingan Sebelum vs Sesudah

| Keadaan | Keterangan | Screenshot |
| --- | --- | --- |
| **Sebelum** | Editor gagal render (kosong) karena konstruksi kustom elemen via `new` melempar `Illegal constructor`, dan re-attach melempar `NotSupportedError`. | [`before.png`](./before.png) (`innerMounted=false`, `editorText=false`) |
| **Sesudah** | Editor berhasil render dengan teks `"reconnect-me"`, shadow root di-reuse dengan bersih tanpa error saat di-reconnect. | [`after.png`](./after.png) (`innerMounted=true`, `editorText=true`, `proseMirror=true`) |
