# DocsEditor

**Rich text editor with page layout & real-time collaboration** — modular, framework-agnostic, like Google Docs as a library.

Built on [TipTap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) with page pagination engine and Yjs-based collaboration.

---

## Packages

| Package | Description | Integration |
|---------|-------------|-------------|
| `@kedata-indonesia/docflow-core` | Headless editor factory + plugin system | Any framework |
| `@kedata-indonesia/docflow-vue` | Vue 3 component + composables | Vue apps |
| `@kedata-indonesia/docflow-element` | Web Component (`<docs-editor>`) | Any HTML/JS |
| `@kedata-indonesia/docflow-plugins` | Built-in plugins (table, image, link, etc.) | Shared |
| `@kedata-indonesia/docflow-layout-engine` | Page split / pagination engine | Internal |

---

## Quick Start

### 📦 Instalasi (via GitHub Packages)

> Packages dipublikasikan ke **GitHub Packages** (bukan npm publik).  
> Untuk menginstall, ikuti langkah-langkah berikut:

**Langkah 1 — Buat `.npmrc` di root project kamu**

```
@kedata-indonesia:registry=https://npm.pkg.github.com
```

**Langkah 2 — Buat GitHub Personal Access Token**

1. Buka https://github.com/settings/tokens
2. Klik **Generate new token (classic)**
3. Beri scope `read:packages`
4. Copy token-nya

**Langkah 3 — Autentikasi**

Simpan token ke `~/.npmrc` (global) atau gunakan via environment variable:

```bash
npm login --registry=https://npm.pkg.github.com
# Username: GitHub username
# Password: token yang dibuat
# Email: email GitHub
```

Atau via `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=TOKEN_KAMU
```

**Langkah 4 — Install packages**

```bash
npm install @kedata-indonesia/docflow-vue @kedata-indonesia/docflow-plugins
```

> 📘 [Dokumentasi GitHub Packages →](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages)

---

### 🖥️ Integrasi Vue 3

**Langkah 1 — Install** (lihat panduan instalasi di atas)

**Langkah 2 — Buat komponen**

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import '@kedata-indonesia/docflow-vue/dist/style.css'

const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world!' }] }],
}

function handleUpdate(json: object) {
  console.log('content updated', json)
}
</script>

<template>
  <DocsEditor
    :model-value="content"
    :plugins="defaultPlugins"
    @update:model-value="handleUpdate"
  />
</template>
```

**Langkah 3 — Jalankan**

```bash
npm run dev
```

---

### 🌐 Web Component (framework apapun)

**Langkah 1 — Install**

```bash
npm install @kedata-indonesia/docflow-element @kedata-indonesia/docflow-plugins
```

**Langkah 2 — Import dan gunakan di HTML/JS**

```html
<script type="module">
  import '@kedata-indonesia/docflow-element'
  import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'

  const editor = document.querySelector('docs-editor')
  editor.plugins = defaultPlugins
</script>

<docs-editor room="my-doc"></docs-editor>
```

### 🧩 Vanilla JS / Headless (tanpa UI)

```bash
npm install @kedata-indonesia/docflow-core @kedata-indonesia/docflow-plugins
```

```ts
import { createEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'

const editor = createEditor({
  target: document.getElementById('editor-root')!,
  plugins: defaultPlugins,
  content: { type: 'doc', content: [] },
  onUpdate: (json) => console.log(json),
})

// Akses TipTap editor
editor.editor.commands.toggleBold()
```

---

## ❓ Status CDN

| CDN | Status | Keterangan |
|-----|--------|------------|
| **esm.sh** | ❌ Belum | esm.sh hanya serve dari npm publik, bukan GitHub Packages |
| **jsDelivr** | ❌ Belum | Bisa serve file dari GitHub, tapi dependency imports tidak ter-resolve |
| **unpkg** | ❌ Belum | Sama seperti di atas |
| **npm publik** | 🚧 Rencana | Akan dipublikasikan ke npm publik setelah versi stabil |

**Solusi sementara:** Ikuti panduan instalasi via GitHub Packages di atas.

---

## Features

### Rich Text

| Style | Shortcut |
|-------|----------|
| Bold | `Cmd/Ctrl + B` |
| Italic | `Cmd/Ctrl + I` |
| Underline | `Cmd/Ctrl + U` |
| Heading 1-3 | `Cmd/Ctrl + Alt + 1-3` |
| Bullet list | `Cmd/Ctrl + Shift + 8` |
| Ordered list | `Cmd/Ctrl + Shift + 7` |
| Blockquote | `Cmd/Ctrl + Shift + B` |
| Code block | `Cmd/Ctrl + Alt + C` |
| Link | `Cmd/Ctrl + K` |
| Undo / Redo | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` |

### Page Layout

- **Auto page break** — konten terbagi otomatis per halaman A4
- **Manual page break** — sisipkan page break via toolbar
- **Page size** — A4, Letter, Legal, atau custom
- **Header / Footer** — dukungan variabel `{page}` dan `{total}`
- **Dark mode** — theme toggle built-in

### Real-time Collaboration

Powered by Yjs (CRDT) — konflik terselesaikan otomatis.

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'

const collaboration = {
  room: 'my-document-room',
  provider: 'webrtc',  // peer-to-peer, tanpa server
  user: { name: 'Alice', color: '#3b82f6' },
}
</script>

<template>
  <DocsEditor :plugins="defaultPlugins" :collaboration="collaboration" />
</template>
```

| Provider | Setup | Use Case |
|----------|-------|----------|
| `webrtc` | Zero-config, P2P | Prototyping, small teams |
| `websocket` | Butuh server (Hocuspocus) | Production, persistence |

```ts
// WebSocket
const collaboration = {
  room: 'doc-123',
  provider: 'websocket',
  websocketUrl: 'wss://your-collab-server.com',
  user: { name: 'Bob', color: '#10b981' },
}
```

---

## Plugin System

### Menggunakan built-in plugins

```ts
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
// defaultPlugins: bold, italic, underline, strike, heading,
// bulletList, orderedList, taskList, blockquote, codeBlock,
// link, image, table, textAlign, placeholder, pageBreak
```

### Membuat plugin kustom

```ts
import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Extension } from '@tiptap/core'

const MyPlugin = definePlugin({
  id: 'my-feature',
  tiptapExtensions: [Extension.create({ name: 'myFeature' })],
  toolbar: [
    { id: 'my-action', iconComponent: 'Bold', label: 'My Action', action: 'toggleBold' },
  ],
  commands: {
    toggleBold: (editor) => editor.chain().focus().toggleBold().run(),
  },
  hooks: {
    onInit: (editor) => console.log('Plugin initialized', editor),
    onDestroy: (editor) => console.log('Plugin destroyed'),
  },
})
```

```vue
<DocsEditor :plugins="[MyPlugin]" />
```

---

## API Reference

### `<DocsEditor>` Props (Vue)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `object \| string` | — | Document content (ProseMirror JSON) |
| `plugins` | `DocsEditorPlugin[]` | `[]` | Active plugins |
| `editable` | `boolean` | `true` | Toggle editing |
| `collaboration` | `object` | — | Collaboration config |
| `pageSize` | `string` | `'a4'` | `'a4'`, `'letter'`, `'legal'`, or custom |
| `title` | `string` | `'Untitled Document'` | Document title (header bar) |
| `starred` | `boolean` | `false` | Star toggle state |
| `connectionState` | `string` | `'connected'` | Status bar indicator |
| `userName` | `string` | `'Demo User'` | Display name |
| `userAvatar` | `string` | `''` | Initials for avatar |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `update:modelValue` | `object` | Content changed |
| `update:title` | `string` | Title changed |
| `update:pageSize` | `string` | Page size changed |
| `toggle-star` | — | Star clicked |
| `back` | — | Back clicked |
| `share` | — | Share clicked |
| `menu-click` | `string` | Menu action |

### Slots

| Slot | Description |
|------|-------------|
| `#header-actions` | Custom buttons in header |

### Web Component Attributes

```html
<docs-editor
  room="doc-123"
  theme="light|dark"
  editable="true|false"
  content='{"type":"doc","content":[]}'
  websocket-url="wss://..."
></docs-editor>
```

### Headless Core API

```ts
import { createEditor } from '@kedata-indonesia/docflow-core'

const editor = createEditor({
  target: document.getElementById('root')!,
  content: { type: 'doc', content: [] },
  plugins: [],
  editable: true,
  onUpdate: (json) => { /* persist */ },
  collaboration: { /* ... */ },
  paginationOptions: { /* pageHeight, pageWidth, margins */ },
})

editor.getJSON()      // → object
editor.getHTML()      // → string
editor.destroy()
editor.use(plugin)    // add plugin at runtime
editor.pluginActions  // → Record<string, Function>
```

### useEditor Composables (Vue - custom UI)

```vue
<script setup lang="ts">
import { useEditor, EditorToolbar, BubbleMenu } from '@kedata-indonesia/docflow-vue'

const { editorRef, editor, pluginActions, isReady } = useEditor({
  content: { type: 'doc', content: [] },
  plugins: defaultPlugins,
  onUpdate: (json) => console.log(json),
})
</script>

<template>
  <EditorToolbar :actions="pluginActions" :editor="editor" />
  <BubbleMenu :editor="editor" :actions="pluginActions" />
  <div ref="editorRef" />
</template>
```

---

## Development

```bash
# 1. Clone
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow

# 2. Install dependencies
pnpm install

# 3. Build semua package
pnpm build

# 4. Jalankan demo
pnpm dev

# Testing
pnpm typecheck      # TypeScript check
pnpm test:unit      # Unit test
pnpm lint           # ESLint
pnpm test:e2e       # Playwright E2E
```

### Project Structure

```
docs-editor/
├── packages/
│   ├── core/              @kedata-indonesia/docflow-core
│   ├── vue/               @kedata-indonesia/docflow-vue
│   ├── element/           @kedata-indonesia/docflow-element
│   ├── plugins/           @kedata-indonesia/docflow-plugins
│   └── layout-engine/     @kedata-indonesia/docflow-layout-engine
├── apps/
│   └── demo/              Demo app (Vite + Vue 3)
├── e2e/                   Playwright E2E tests
└── docs/                  Documentation
```

---

## Architecture

```
User input
    ↓
ProseMirror state (single source of truth — satu-satunya yang bisa diedit)
    ↓
Layout Engine (split konten ke halaman — read-only derived view)
    ↓
DOM render (halaman 1, 2, 3...)
    ↓
Collab? → Yjs sync ke peer/server
```

---

## License

MIT
