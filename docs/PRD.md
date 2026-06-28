# PRD — DocsEditor

**Dokumen**: Product Requirements Document
**Versi**: 1.0
**Status**: Draft

---

## 1. Ringkasan

Editor dokumen berbasis web dengan kemampuan rich text, page layout, dan real-time collaboration. Mirip Google Docs tetapi modular — bisa dipasang di proyek mana pun sebagai Web Component maupun library.

---

## 2. Tujuan

- Membangun editor dokumen yang bisa dipasang di berbagai aplikasi (Vue, React, Vanilla JS)
- Mendukung editing rich text dengan page layout (page break, pagination, header/footer)
- Real-time multi-user collaboration
- Ekosistem plugin yang modular

---

## 3. Target Pengguna

1. **Developer frontend** — mengintegrasikan editor ke aplikasi mereka
2. **End-user** — menulis dokumen dengan pengalaman seperti Google Docs

---

## 4. Fitur

### 4.0 Fase 0 — Vibe Foundation

Karena kita menggunakan pendekatan **vibe code**, seluruh fitur berprioritas **P0** dikerjakan dalam fase awal untuk mendapatkan alur end-to-end yang berfungsi. Tabel-tabel di bawah tetap menggambarkan area fitur; item P0-nya masuk Fase 0.

| Fitur | Prioritas | Keterangan |
|-------|-----------|------------|
| Rich text formatting, heading, lists, blockquote, code block, link, image, table, alignment, undo/redo, toolbar, bubble menu | P0 | Lihat 4.1 |
| Page container, auto page break, manual page break | P0 | Lihat 4.2 |
| Real-time editing, multi-user cursor, user presence | P0 | Lihat 4.3 |
| Web Component, NPM package, plugin system API | P0 | Lihat 4.4 |

### 4.1 Rich Text (Fase 1)

| Fitur | Prioritas | Keterangan |
|-------|-----------|------------|
| Rich text formatting (bold, italic, underline, strikethrough) | P0 | |
| Heading (H1-H6) | P0 | |
| Lists (bullet, ordered, task) | P0 | |
| Blockquote | P0 | |
| Code block | P0 | |
| Link | P0 | |
| Image | P0 | |
| Table | P0 | |
| Text alignment | P0 | |
| Undo / Redo | P0 | |
| Toolbar formatting | P0 | |
| Bubble menu (floating saat select) | P0 | |
| Slash command menu | P1 | |

### 4.2 Page Layout (Fase 2)

| Fitur | Prioritas | Keterangan |
|-------|-----------|------------|
| Page container (A4/Legal ratio) | P0 | Setiap halaman sebagai div terpisah |
| Auto page break (content overflow ke halaman berikutnya) | P0 | Algoritma split konten |
| Manual page break | P0 | User insert page break |
| Orphan/widow control | P1 | Minimal 2 baris tersisa |
| Page counter | P1 | "Page 1 of 3" |
| Header / Footer | P1 | |
| Nomor halaman otomatis | P1 | |
| Margin halaman | P1 | |
| Latar belakang kertas | P1 | Shadow, efek kertas |

#### Algoritma Auto Page Break (Fase 0)

Auto page break dijalankan oleh **Layout Engine** sebagai *derived view* dari ProseMirror state. Layout Engine tidak mengubah state editor; ia hanya menghasilkan model halaman yang dirender UI.

1. **Shadow layout** — setelah perubahan (debounced 100–200 ms), kloning DOM editor ke elemen off-screen dengan lebar & styling halaman final.
2. **Block measurement** — bagi konten menjadi top-level blocks (paragraph, heading, list, table, image, code block, blockquote). Ukur `top` dan `bottom` masing-masing relatif terhadap container.
3. **Greedy page packing** — untuk setiap halaman dengan tinggi tersedia `H`, masukkan block berurutan selama `bottom <= H`. Jika block berikutnya melebihi `H`, lanjutkan ke halaman baru.
4. **Block-level splitting** (hanya untuk teks):
   - Gunakan `Range` + `getClientRects()` atau binary search offset teks untuk menemukan pemotongan terakhir yang masih muat.
   - Potong pada batas kata/offset ProseMirror; sisanya pindah ke halaman berikutnya.
   - Table/gambar yang tidak muat dipindahkan utuh ke halaman berikutnya (tidak dipecah di Fase 0).
5. **Derived page model** — hasilnya array `Page[]`, masing-masing menyimpan rentang posisi ProseMirror (`from`, `to`) dan daftar block pointer.
6. **Rendering** — UI membuat satu `div.page` per halaman dan menyalin/render block sesuai model. Halaman tidak `contenteditable`; input tetap pada satu instance ProseMirror (single source of truth). Mapping input dari halaman kembali ke ProseMirror dilakukan via posisi absolut.
7. **Optimasi** — debounce, `ResizeObserver` untuk re-layout, dan cache measurement jika struktur tidak berubah.

### 4.3 Collaboration (Fase 3)

| Fitur | Prioritas | Keterangan |
|-------|-----------|------------|
| Real-time editing (Yjs CRDT) | P0 | |
| Multi-user cursor | P0 | |
| User presence (siapa online) | P0 | |
| Auto-save | P1 | |
| Version history | P2 | |
| Comments / Annotation | P2 | |
| Suggesting mode (track changes) | P2 | |

### 4.4 Plugins & Distribution (Fase 4)

| Fitur | Prioritas | Keterangan |
|-------|-----------|------------|
| Web Component (`<docs-editor>`) | P0 | Framework-agnostic |
| NPM package (`@docs-editor/core`) | P0 | |
| CDN distribution | P1 | unpkg, jsdelivr, esm.sh |
| Plugin system API | P0 | `definePlugin()` |
| Vue binding (`@docs-editor/vue`) | P1 | |
| React binding (`@docs-editor/react`) | P2 | |

---

## 5. Arsitektur

### 5.1 Layer

```
┌──────────────────────────────────────┐
│         Framework Bindings            │
│  @docs-editor/vue, @docs-editor/react  │
├──────────────────────────────────────┤
│         Web Component                 │
│  @docs-editor/element (<docs-editor>)  │
├──────────────────────────────────────┤
│              Core                     │
│  @docs-editor/core                    │
│  └─ createEditor()                   │
│  └─ PluginSystem                     │
├──────────────────────────────────────┤
│         Layout Engine                │
│  @docs-editor/layout-engine           │
│  └─ PageLayout (page split)          │
│  └─ PageBreaker (overflow calc)      │
├──────────────────────────────────────┤
│         Editor Engine                 │
│  @tiptap/core + ProseMirror          │
├──────────────────────────────────────┤
│         Collaboration                 │
│  Yjs + y-websocket / y-webrtc        │
└──────────────────────────────────────┘
```

### 5.2 Aliran Data

```
User input
    ↓
ProseMirror state (document)
    ↓
Layout Engine (split ke halaman)
    ↓
DOM render (halaman 1, 2, 3...)
    ↓
Collab? → Yjs sync ke peer/server
```

---

## 6. Tech Stack

| Komponen | Teknologi | Alasan |
|----------|-----------|--------|
| UI Framework | Vue 3 + TypeScript | Preferensi user, mudah dipahami |
| Editor Core | TipTap 2.x + ProseMirror | Headless, extensible, mature |
| Layout Engine | Vanilla TypeScript | Framework-agnostic, performa |
| Collaboration | Yjs (CRDT) + y-websocket | Auto conflict resolution |
| Collaboration Server | Hocuspocus / y-websocket (opsional) | |
| P2P Collaboration | y-webrtc (tanpa server) | Untuk prototyping |
| Styling | CSS / Tailwind | |
| Build | Vite + tsup | Library mode + ESM/CJS |
| Web Component | Vue defineCustomElement + wrapper | |
| Testing | Vitest + Playwright | |
| Package Manager | pnpm (workspaces) | Monorepo |

---

## 7. Struktur Proyek (Monorepo)

```
docs-editor/
├── docs/
│   └── PRD.md
├── packages/
│   ├── core/                     ← @docs-editor/core
│   │   ├── src/
│   │   │   ├── Editor.ts         ← TipTap wrapper
│   │   │   ├── PluginSystem.ts   ← definePlugin()
│   │   │   ├── Collaboration.ts  ← Yjs setup
│   │   │   └── index.ts
│   │   └── package.json
│   ├── layout-engine/            ← @docs-editor/layout-engine
│   │   ├── src/
│   │   │   ├── PageLayout.ts     ← Split content ke halaman
│   │   │   ├── PageBreaker.ts    ← Overflow calculation
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── element/                  ← @docs-editor/element
│   │   ├── src/
│   │   │   ├── DocsEditor.ts     ← Custom Element
│   │   │   └── index.ts
│   │   └── package.json
│   ├── vue/                      ← @docs-editor/vue
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── DocsEditor.vue
│   │   │   │   ├── EditorToolbar.vue
│   │   │   │   └── PageView.vue
│   │   │   ├── composables/
│   │   │   │   └── useEditor.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── plugins/                  ← @docs-editor/plugins
│       ├── src/
│       │   ├── image/
│       │   ├── table/
│       │   ├── comment/
│       │   └── ...
│       └── package.json
├── apps/
│   └── demo/                     ← Demo app (Vite + Vue)
├── package.json                  ← Root workspace
└── pnpm-workspace.yaml
```

---

## 8. Plugin System

```ts
// API desain
import { definePlugin } from '@docs-editor/core'

const ImagePlugin = definePlugin({
  id: 'image',
  tiptapExtensions: [ImageExtension],
  toolbar: {
    items: [{ id: 'image', icon: '📷', action: 'insertImage' }],
  },
  slashCommands: [
    { name: 'Image', command: 'insertImage' },
  ],
  hooks: {
    onInit: (editor) => {},
    onDestroy: (editor) => {},
  },
})
```

Plugin bisa diaktifkan per-instance:

```ts
const editor = createEditor({
  plugins: [ImagePlugin, TablePlugin, CommentPlugin],
})
```

---

## 9. Distribusi

### Web Component (CDN)

```html
<script type="module" src="https://esm.sh/@docs-editor/element"></script>
<docs-editor room="doc-123" theme="light"></docs-editor>
```

### NPM

```bash
npm install @docs-editor/vue
```

```vue
<template>
  <DocsEditor v-model="content" :plugins="plugins" />
</template>

<script setup>
import { DocsEditor } from '@docs-editor/vue'
</script>
```

### Vanilla JS

```html
<script type="module">
import { createEditor } from 'https://esm.sh/@docs-editor/core'
const editor = createEditor({ target: document.body })
</script>
```

---

## 10. Milestone

| Fase | Durasi Estimasi | Output |
|------|----------------|--------|
| **Fase 0: Vibe Foundation (semua P0)** | 4-6 minggu | Rich text + page layout dasar + collab dasar + plugin API + NPM/Web Component skeleton |
| **Fase 1: Rich Text & Page Layout Polish** | 2-4 minggu | Slash command, header/footer, margin, page counter, auto-save |
| **Fase 2: Collaboration Polish** | 2-4 minggu | Version history, comments, track changes |
| **Fase 3: Distribution & Bindings** | 2 minggu | Vue/React binding, CDN, dokumentasi |
| **Fase 4: Polish** | Berkelanjutan | Testing, performance, dokumentasi |

---

## 11. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Page layout algorithm terlalu kompleks | Delay Fase 0 | Sudah didetailkan di 4.2; fallback ke manual page break jika auto-split belum stabil |
| Yjs + TipTap conflict dengan page layout | Tinggi | Layout engine hanya baca ProseMirror state, tidak mengubah; render sebagai derived view |
| Performa split tiap ketikan | Lag pada dokumen besar | Debounce + virtual scrolling untuk banyak halaman |
| Web Component tidak support semua browser | Kompatibilitas | Target modern browsers (Chrome, Firefox, Safari, Edge) |

---

## 12. Glossary

| Istilah | Definisi |
|---------|----------|
| CRDT | Conflict-free Replicated Data Type — algoritma sinkronisasi tanpa conflict |
| ProseMirror State | Representasi internal dokumen sebagai schema-based tree |
| Page Break | Batas antar halaman (otomatis atau manual) |
| Orphan/Widow | Baris pertama paragraf di akhir halaman / baris terakhir di awal halaman |
| Awareness | Informasi siapa yang sedang online dan posisi cursor mereka |
| Custom Element | API browser native untuk membuat HTML tag baru (`<docs-editor>`) |
