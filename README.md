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

### Instalasi

Packages dipublikasikan ke **GitHub Packages**. Untuk menginstall:

**1 — Buat `.npmrc` di root project kamu**

```
@kedata-indonesia:registry=https://npm.pkg.github.com
```

**2 — Buat GitHub Personal Access Token**

- Buka https://github.com/settings/tokens
- Klik **Generate new token (classic)**
- Beri scope `read:packages`
- Copy token-nya

**3 — Autentikasi**

```bash
npm login --registry=https://npm.pkg.github.com
# Username: GitHub username
# Password: token yang dibuat
# Email: email GitHub
```

Atau langsung di `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=TOKEN_KAMU
```

**4 — Install packages**

```bash
npm install @kedata-indonesia/docflow-vue @kedata-indonesia/docflow-plugins
```

---

### Vue 3

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

### Web Component (framework apapun)

```bash
npm install @kedata-indonesia/docflow-element @kedata-indonesia/docflow-plugins
```

```html
<script type="module">
  import '@kedata-indonesia/docflow-element'
  import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'

  const editor = document.querySelector('docs-editor')
  editor.plugins = defaultPlugins
</script>

<docs-editor room="my-doc"></docs-editor>
```

### Vanilla JS / Headless

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
```



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

Powered by Yjs (CRDT).

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'

const collaboration = {
  room: 'my-document-room',
  provider: 'webrtc',
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

---

## Plugin System

### Built-in plugins

```ts
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
```

Mencakup: bold, italic, underline, strike, heading, bulletList, orderedList, taskList, blockquote, codeBlock, link, image, table, textAlign, placeholder, pageBreak.

### Plugin kustom

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

---

## API Reference

### `<DocsEditor>` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `object \| string` | — | Document content (ProseMirror JSON) |
| `plugins` | `DocsEditorPlugin[]` | `[]` | Active plugins |
| `editable` | `boolean` | `true` | Toggle editing |
| `collaboration` | `object` | — | Collaboration config |
| `pageSize` | `string` | `'a4'` | `'a4'`, `'letter'`, `'legal'`, or custom |
| `title` | `string` | `'Untitled Document'` | Document title |
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

editor.getJSON()
editor.getHTML()
editor.destroy()
editor.use(plugin)
editor.pluginActions
```

### useEditor (Vue - custom UI)

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
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow
pnpm install
pnpm build
pnpm dev              # Demo app
pnpm typecheck        # TypeScript
pnpm test:unit        # Unit test
pnpm lint             # ESLint
pnpm test:e2e         # Playwright
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

## License

MIT
