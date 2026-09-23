# DocFlow

**Modular rich-text editor with page layout & real-time collaboration** — framework-agnostic, embeddable in any web app.

Built on [TipTap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net), with a page-pagination engine and Yjs-based collaboration.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Built on: TipTap + Yjs + Vue](https://img.shields.io/badge/built%20on-TipTap%20%2B%20Yjs%20%2B%20Vue-blueviolet)](https://tiptap.dev)

> **Library boundary:** DocFlow's `packages/*` know nothing about the backend. Persistence,
> auth, and storage are the host app's job, reached only through narrow injectable ports
> (`onUpdate`, `collaboration`, `onImageUpload`, `aiStream`, `aiDraft`). No `packages/*`
> imports the host app or any backend dependency.

---

## Packages

| Package | Description | Integration |
|---------|-------------|-------------|
| `@kedataindo/docflow-core` | Headless editor factory + plugin system | Any framework |
| `@kedataindo/docflow-vue` | Vue 3 component + composables | Vue apps |
| `@kedataindo/docflow-element` | Web Component (`<docs-editor>`) | Any HTML/JS |
| `@kedataindo/docflow-plugins` | Built-in plugins (table, image, link, etc.) | Shared |
| `@kedataindo/docflow-layout-engine` | Page split / pagination engine | Internal |
| `@kedataindo/docflow-export` | DOCX / Markdown / HTML export helpers | Shared |

> Source package names use the `@kedata-indonesia` workspace scope; releases are
> published to npm under `@kedataindo`.

---

## Quick Start

### Vue 3

```bash
npm install @kedataindo/docflow-vue @kedataindo/docflow-plugins
```

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedataindo/docflow-vue'
import { defaultPlugins } from '@kedataindo/docflow-plugins'
import '@kedataindo/docflow-vue/style.css'

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

### Web Component (any framework)

```bash
npm install @kedataindo/docflow-element @kedataindo/docflow-plugins
```

```html
<script type="module">
  import '@kedataindo/docflow-element'
  import { defaultPlugins } from '@kedataindo/docflow-plugins'

  const editor = document.querySelector('docs-editor')
  editor.plugins = defaultPlugins
</script>

<docs-editor room="my-doc"></docs-editor>
```

### Vanilla JS / headless

```bash
npm install @kedataindo/docflow-core @kedataindo/docflow-plugins
```

```ts
import { createEditor } from '@kedataindo/docflow-core'
import { defaultPlugins } from '@kedataindo/docflow-plugins'

const editor = createEditor({
  target: document.getElementById('editor-root')!,
  plugins: defaultPlugins,
  content: { type: 'doc', content: [] },
  onUpdate: (json) => console.log(json),
})
```

---

## Features

### Rich text

Bold, italic, underline, strikethrough, headings H1–H6, bullet/ordered/task lists,
blockquote, code block, link, image, table, text alignment, undo/redo, toolbar, and
bubble menu.

### Page layout

- **Auto page break** — content flows across A4 pages automatically
- **Manual page break** — insert from the toolbar
- **Page size** — A4, Letter, Legal, or custom
- **Header / footer** — supports `{page}` and `{total}` variables
- **Dark mode** — built-in theme toggle

### Real-time collaboration

Powered by Yjs (CRDT).

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedataindo/docflow-vue'
import { defaultPlugins } from '@kedataindo/docflow-plugins'

const collaboration = {
  room: 'my-document-room',
  provider: 'websocket',
  websocketUrl: 'wss://your-collab-server',
  user: { name: 'Alice', color: '#3b82f6' },
}
</script>

<template>
  <DocsEditor :plugins="defaultPlugins" :collaboration="collaboration" />
</template>
```

The library never picks a collaboration endpoint on its own — the host supplies the room,
provider, and signaling/websocket URLs.

---

## Plugin system

```ts
import { definePlugin } from '@kedataindo/docflow-core'
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

## Development

Requirements: Node.js >= 20 and pnpm >= 9.

```bash
pnpm install
pnpm build        # build all packages
pnpm typecheck    # TypeScript
pnpm test:unit    # unit tests (Vitest)
pnpm lint         # ESLint
pnpm dev          # run the demo app
```

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before opening an issue or PR.

---

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).
Third-party components keep their original licenses — see [NOTICE](./NOTICE).
