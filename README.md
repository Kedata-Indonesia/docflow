# DocFlow

**The open-source editor engine for document-style apps** — true A4 pagination, real-time collaboration, and layout-aware AI. Free to embed (Apache-2.0); pay only for the cloud services around it.

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License: Apache-2.0"></a>
  <a href="https://www.npmjs.com/package/@kedataindo/docflow-core"><img src="https://img.shields.io/npm/v/@kedataindo/docflow-core" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@kedataindo/docflow-core"><img src="https://img.shields.io/npm/dm/@kedataindo/docflow-core" alt="npm downloads"></a>
  <a href="https://github.com/Kedata-Indonesia/docflow/actions/workflows/publish.yml"><img src="https://github.com/Kedata-Indonesia/docflow/actions/workflows/publish.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/built%20on-TipTap%20%2B%20Yjs%20%2B%20Vue-blueviolet" alt="Built on TipTap + Yjs + Vue">
</p>

<p align="center">
  <a href="https://dev-docflow-web.kedata.cloud"><b>Live demo</b></a> ·
  <a href="https://github.com/Kedata-Indonesia/docflow-app"><b>docflow-app</b> (web UI + API server)</a> ·
  <a href="./docs/PUBLISH.md"><b>Docs</b></a>
</p>

Built on [TipTap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) with a page pagination engine and Yjs-based collaboration.

> This repository holds the **library packages** only. The deployable application
> (web UI + API server + demo) lives in
> [`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).

---

## Why DocFlow?

- **True page layout** — auto page-breaks, headers/footers with `{page}`/`{total}`, A4/Letter/Legal. TipTap does not offer this; CKEditor gates it behind a premium plugin; OnlyOffice is heavyweight and AGPL.
- **Apache-2.0 license** — safe for commercial embedding and self-hosting. No copyleft anxiety, no premium gates. The core stays Apache-2.0 forever.
- **Real-time collaboration built in** — Yjs CRDT out of the box, self-hostable. An alternative to TipTap Collab / Liveblocks without per-seat lock-in.
- **Layout-aware AI** — AI drafts that respect A4 structure (e.g. prompt → paginated Indonesian formal letter) via the built-in `aiStream` / `aiDraft` ports.
- **Built in Indonesia** — Bahasa-friendly, PDPA-friendly self-hosting.

### Comparison

| | DocFlow | TipTap | CKEditor 5 | OnlyOffice |
|---|---------|--------|------------|------------|
| A4 pagination / page breaks | ✅ Built-in | ❌ Not offered | 💰 Premium plugin | ✅ Full suite (heavy) |
| Headers / footers with page numbers | ✅ Built-in | ❌ Not offered | 💰 Premium plugin | ✅ |
| Real-time collaboration | ✅ Yjs, self-hostable | Hocuspocus (OSS backend); Collab cloud is paid | 💰 Premium | ✅ |
| License | **Apache-2.0** | MIT | GPL / commercial | **AGPL** |
| Embeddable npm packages | ✅ | ✅ | ✅ | iframe / heavy |
| Layout-aware AI hooks | ✅ Ports included | 💰 Content AI (paid) | 💰 AI Assistant (paid) | ❌ |

*Honest take: if you don't need pages, use TipTap. If you need Word-style documents inside your own app, that's us.*

## Who is this for?

| You build | DocFlow gives you |
|-----------|-------------------|
| Contract editors, report generators, CMS document features | Drop-in paginated editor, self-hosted collab, no per-seat fees |
| Surat / HR / school document systems (agencies) | A4 layout + kop surat templates + Bahasa support, free under Apache-2.0 |
| Internal document systems (enterprise, banks, SOEs, gov) | Self-hostable, PDPA-friendly, air-gapped deployment |
| Legaltech / edtech / HR vertical apps | Compliance-friendly embedding with DOCX export |

---

## Quick Start

### Installation

Packages are published publicly on **npm** under the `@kedataindo` scope — no auth, no `.npmrc`, just install:

```bash
npm install @kedataindo/docflow-vue @kedataindo/docflow-plugins
```

---

### Vue 3

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedataindo/docflow-vue'
import { defaultPlugins } from '@kedataindo/docflow-plugins'
import '@kedataindo/docflow-vue/dist/style.css'

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

### Vanilla JS / Headless

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

## Packages

| Package | Description | Integration |
|---------|-------------|-------------|
| `@kedataindo/docflow-core` | Headless editor factory + plugin system | Any framework |
| `@kedataindo/docflow-vue` | Vue 3 component + composables | Vue apps |
| `@kedataindo/docflow-element` | Web Component (`<docs-editor>`) | Any HTML/JS |
| `@kedataindo/docflow-plugins` | Built-in plugins (table, image, link, etc.) | Shared |
| `@kedataindo/docflow-layout-engine` | Page split / pagination engine | Internal |
| `@kedataindo/docflow-export` | DOCX / Markdown export | Shared |

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

- **Auto page break** — content is automatically split into A4 pages
- **Manual page break** — insert a page break from the toolbar
- **Page size** — A4, Letter, Legal, or custom
- **Header / Footer** — supports the `{page}` and `{total}` variables
- **Dark mode** — built-in theme toggle

### Real-time Collaboration

Powered by Yjs (CRDT).

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedataindo/docflow-vue'
import { defaultPlugins } from '@kedataindo/docflow-plugins'

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
| `websocket` | Requires a server (Hocuspocus) | Production, persistence |

### AI Hooks

DocFlow ships injection ports (`aiStream`, `aiDraft`) so the host app can plug in layout-aware AI — drafts that respect A4 structure instead of dumping a wall of text. See `docs/LIBRARY_CONTRACT.md`.

---

## Plugin System

### Built-in plugins

```ts
import { defaultPlugins } from '@kedataindo/docflow-plugins'
```

Includes: bold, italic, underline, strike, heading, bulletList, orderedList, taskList, blockquote, codeBlock, link, image, table, textAlign, placeholder, pageBreak.

### Custom plugin

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
import { createEditor } from '@kedataindo/docflow-core'

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
import { useEditor, EditorToolbar, BubbleMenu } from '@kedataindo/docflow-vue'

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

## Open-core model

The editor engine is **free and open-source (Apache-2.0) — forever**. We monetize the services around it:

- **Hosted collaboration** — managed Yjs sync on [kedata.cloud](https://kedata.cloud)
- **Hosted AI** — managed layout-aware AI drafting
- **Enterprise support & services** — SLAs, custom integrations, on-prem/air-gapped deployment help

You are never locked in: everything above can be self-hosted with the code in this repo and [`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).

## Community

- [GitHub Discussions](https://github.com/Kedata-Indonesia/docflow/discussions) — questions, RFCs, showcase
- [Issues](https://github.com/Kedata-Indonesia/docflow/issues) — bugs and feature requests
- Live demo: https://dev-docflow-web.kedata.cloud

## Contributing

Contributions are welcome — bug reports, RFC discussions, and pull requests. `main` is protected: fork the repo, create a branch, and open a PR. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup, verification steps, and PR expectations, and open an issue first for anything non-trivial so we can align on direction.

## Development

```bash
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow
pnpm install
pnpm build
pnpm dev              # playground — http://localhost:5200
pnpm typecheck        # TypeScript
pnpm test:unit        # Unit test
pnpm lint             # ESLint
```

> The deployable application (web UI + API server) and its Docker stack live in the
> separate [`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app) repository.

### Playground (local review)

[`examples/playground`](./examples/playground) is a small backend-free Vite app that
mounts `<DocsEditor>` **through the public API only** (`defaultPlugins`, props,
events). Use it to review UI changes, compare branches, or copy a working setup:

```bash
pnpm build && pnpm dev
# edit packages/* with HMR instead of rebuilding:
pnpm dev:source
```

It owns its fixtures (documents, comment threads, versions, collaborators) in
memory — no server, no database, nothing published.

### Docker

The self-hosted Docker stack (server + web app + MongoDB) lives in the
[`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app) repository. This
package repository only builds and publishes the `@kedataindo/docflow-*` libraries.

### Project Structure

```
docflow/
├── packages/
│   ├── core/              @kedataindo/docflow-core
│   ├── vue/               @kedataindo/docflow-vue
│   ├── element/           @kedataindo/docflow-element
│   ├── plugins/           @kedataindo/docflow-plugins
│   ├── layout-engine/     @kedataindo/docflow-layout-engine
│   └── export/            @kedataindo/docflow-export
├── examples/
│   └── playground/        backend-free demo app (not published)
└── docs/                  Documentation
```

## Releasing

Packages are published triggered by a git tag (`v*`), not on every push to main: publicly to **npm** under `@kedataindo/docflow-*` (the in-repo source scope stays `@kedata-indonesia`). See [docs/PUBLISH.md](./docs/PUBLISH.md) for the full guide.

```bash
# After bumping versions in packages/*/package.json:
git tag v0.0.5
git push --tags
# → GitHub Actions publishes automatically to the public npm registry
```

---

## License

**Apache-2.0** — see [`LICENSE`](./LICENSE) at the repo root. The core editor stays Apache-2.0 forever.

Bundled third-party components (TipTap, Yjs, Hocuspocus, Vue, etc.)
keep their original MIT (or other) licenses — see [`NOTICE`](./NOTICE)
for the full list and per-component pointers.

For questions (Indonesian / English): **info@kedata.online**.

---

<p align="center">
  Made with ♥ by <a href="https://kedata.cloud">Kedata</a> in Indonesia
</p>
