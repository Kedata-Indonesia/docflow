# DocsEditor

**Rich text editor with page layout & real-time collaboration** — modular, framework-agnostic, like Google Docs as a library.

Built on [TipTap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) with page pagination engine and Yjs-based collaboration.

---

## Packages

| Package | Description | Integration |
|---------|-------------|-------------|
| `@kedata-indonesia/docflow-vue` | Vue 3 component + composables | Vue apps |
| `@kedata-indonesia/docflow-element` | Web Component (`<docs-editor>`) | Any HTML/JS |
| `@kedata-indonesia/docflow-core` | Headless editor factory + plugin system | Any framework |
| `@kedata-indonesia/docflow-plugins` | Built-in plugins (table, image, link, etc.) | Shared |
| `@kedata-indonesia/docflow-layout-engine` | Page split / pagination engine | Internal |

---

## Quick Start

> **📦 Packages are published via GitHub Packages.**  
> To install, create a `.npmrc` file in your project:
> ```
> @kedata-indonesia:registry=https://npm.pkg.github.com
> ```
> Then authenticate with a GitHub token that has `read:packages` scope.  
> [See GitHub docs →](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages)

### Vue 3

```bash
npm install @kedata-indonesia/docflow-vue @kedata-indonesia/docflow-plugins
```

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

### Web Component (CDN — any framework / vanilla HTML)

```html
<script type="module">
  import 'https://esm.sh/@kedata-indonesia/docflow-element'
  import 'https://esm.sh/@kedata-indonesia/docflow-plugins'
</script>

<docs-editor room="my-doc" theme="light"></docs-editor>
```

> **Note:** Web Component is built on Vue internally but exposed as a framework-agnostic custom element. Works in any JS environment (React, Angular, Svelte, vanilla HTML).

### Vanilla JS (headless core)

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

// Access TipTap editor instance
editor.editor.commands.toggleBold()
```

---

## Features

### Rich Text

All standard formatting via the toolbar or keyboard shortcuts:

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

- **Auto page break** — content flows across A4-sized pages automatically
- **Manual page break** — insert page breaks with a toolbar button or `pagebreak` extension
- **Page size options** — A4, Letter, Legal, or custom dimensions
- **Header / Footer** — per-document header and footer with `{page}` and `{total}` variables
- **Dark mode** — built-in theme toggle

### Real-time Collaboration

Powered by Yjs — conflicts resolved automatically via CRDT.

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import '@kedata-indonesia/docflow-vue/dist/style.css'

const collaboration = {
  room: 'my-document-room',
  provider: 'webrtc',  // peer-to-peer, no server needed
  user: { name: 'Alice', color: '#3b82f6' },
}
</script>

<template>
  <DocsEditor
    :plugins="defaultPlugins"
    :collaboration="collaboration"
  />
</template>
```

Two providers available:

| Provider | Setup | Use Case |
|----------|-------|----------|
| `webrtc` | Zero-config, P2P | Prototyping, small teams |
| `websocket` | Requires server (e.g. Hocuspocus) | Production, persistence |

```ts
// WebSocket example
const collaboration = {
  room: 'doc-123',
  provider: 'websocket',
  websocketUrl: 'wss://your-collab-server.com',
  user: { name: 'Bob', color: '#10b981' },
}
```

---

## Plugin System

Plugins are how you add or remove editor capabilities.

### Using built-in plugins

```ts
import { defaultPlugins, definePlugin } from '@kedata-indonesia/docflow-plugins'
// defaultPlugins includes: bold, italic, underline, strike, heading,
// bulletList, orderedList, taskList, blockquote, codeBlock, link,
// image, table, textAlign, placeholder
```

### Creating a custom plugin

```ts
import { definePlugin } from '@kedata-indonesia/docflow-core'
import { Extension } from '@tiptap/core'

const MyPlugin = definePlugin({
  id: 'my-feature',
  tiptapExtensions: [Extension.create({ name: 'myFeature' })],
  toolbar: [
    { id: 'my-action', iconComponent: 'Bold', label: 'My Action', action: 'toggleBold' },
  ],
  slashCommands: [
    { name: 'My Feature', command: 'toggleBold' },
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

### Passing plugins to the editor

```vue
<DocsEditor :plugins="[MyPlugin, AnotherPlugin]" />
```

---

## `<DocsEditor>` Props (Vue)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `object \| string` | — | Document content (ProseMirror JSON) |
| `plugins` | `DocsEditorPlugin[]` | `[]` | Active plugins |
| `editable` | `boolean` | `true` | Toggle editing |
| `collaboration` | `object` | — | [Collaboration config](#real-time-collaboration) |
| `pageSize` | `string` | `'a4'` | `'a4'`, `'letter'`, `'legal'`, or custom |
| `title` | `string` | `'Untitled Document'` | Document title (header bar) |
| `starred` | `boolean` | `false` | Star toggle state |
| `connectionState` | `string` | `'connected'` | Status bar indicator |
| `userName` | `string` | `'Demo User'` | Display name for collaboration |
| `userAvatar` | `string` | `''` | Initials for avatar |

### Emitted Events

| Event | Payload | Description |
|-------|---------|-------------|
| `update:modelValue` | `object` | Document content changed |
| `update:title` | `string` | Title changed |
| `update:pageSize` | `string` | Page size changed |
| `toggle-star` | — | Star button clicked |
| `back` | — | Back button clicked |
| `share` | — | Share button clicked |
| `menu-click` | `string` | Menu action triggered |

### Slots

| Slot | Description |
|------|-------------|
| `#header-actions` | Custom buttons in the header bar |

---

## Web Component API

### Attributes

```html
<docs-editor
  room="doc-123"
  theme="light|dark"
  editable="true|false"
  content='{"type":"doc","content":[]}'
  websocket-url="wss://..."
></docs-editor>
```

### Setting plugins (JavaScript)

```html
<script type="module">
  import 'https://esm.sh/@kedata-indonesia/docflow-element'
  import { defaultPlugins } from 'https://esm.sh/@kedata-indonesia/docflow-plugins'
  
  const el = document.querySelector('docs-editor')
  el.plugins = defaultPlugins
</script>
```

---

## Headless Core API

The `@kedata-indonesia/docflow-core` package exposes the editor factory without any UI bindings.

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

editor.getJSON()     // → object
editor.getHTML()     // → string
editor.destroy()
editor.use(plugin)   // add plugin at runtime
editor.pluginActions // → Record<string, Function>
```

---

## useEditor Composables (Vue)

For custom editor UIs built from individual components:

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
# Clone & install
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow
pnpm install

# Run the demo app
pnpm dev

# Build all packages
pnpm build

# Type check
pnpm typecheck

# Unit tests
pnpm test:unit

# Lint
pnpm lint

# E2E tests
pnpm test:e2e
```

### Project Structure

```
docs-editor/
├── packages/
│   ├── core/              @kedata-indonesia/docflow-core
│   ├── vue/               @kedata-indonesia/docflow-vue
│   ├── element/           @kedata-indonesia/docflow-element (Web Component)
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
ProseMirror state (single source of truth)
    ↓
Layout Engine (split konten ke halaman — derived view, tidak mengubah state)
    ↓
DOM render (halaman 1, 2, 3...)
    ↓
Collab? → Yjs sync ke peer/server
```

- **ProseMirror state** adalah satu-satunya model yang bisa diedit.
- **Layout Engine** hanya membaca state dan menghasilkan model halaman untuk rendering.
- **Collaboration** (Yjs) menyinkronkan state antar pengguna.

---

## License

MIT
