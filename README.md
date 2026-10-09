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

<p align="center">
  <img src="./docs/assets/docflow-demo.gif" alt="DocFlow demo — A4 pagination with auto page breaks, live {page}/{total} footers, collaborator presence avatars, and the export menu" width="900">
</p>

Built on [TipTap](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) with a page pagination engine and Yjs-based collaboration.

> This repository holds the **library packages** only. The deployable application
> (web UI + API server + demo) lives in
> [`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).

---

## Why DocFlow?

- **True page layout** — auto page-breaks, headers/footers with `{page}`/`{total}`, A4/Letter/Legal. TipTap offers this only via the paid Pages Pro extension; CKEditor gates it behind a premium plugin; OnlyOffice is heavyweight and AGPL.
- **Apache-2.0 license** — safe for commercial embedding and self-hosting. No copyleft anxiety, no premium gates. The core stays Apache-2.0 forever.
- **Real-time collaboration built in** — Yjs CRDT out of the box, self-hostable. An alternative to TipTap Collab / Liveblocks without per-seat lock-in.
- **Layout-aware AI** — AI drafts that respect A4 structure (e.g. prompt → paginated Indonesian formal letter) via the built-in `aiStream` / `aiDraft` ports.
- **Built in Indonesia** — Bahasa-friendly, PDPA-friendly self-hosting.

### Comparison

| | DocFlow | TipTap | CKEditor 5 | OnlyOffice |
|---|---------|--------|------------|------------|
| A4 pagination / page breaks | ✅ Built-in | 💰 Pages (Pro extension) | 💰 Premium plugin | ✅ Full suite (heavy) |
| Headers / footers with page numbers | ✅ Built-in | 💰 Pages (Pro extension) | 💰 Premium plugin | ✅ |
| Real-time collaboration | ✅ Yjs, self-hostable | Hocuspocus (OSS backend); Collab cloud is paid | 💰 Premium | ✅ |
| License | **Apache-2.0** | MIT (core); Pro extensions require a paid plan | GPL / commercial | **AGPL** |
| Embeddable npm packages | ✅ | ✅ | ✅ | iframe / heavy |
| Layout-aware AI hooks | ✅ Ports included | 💰 Content AI (paid add-on) | 💰 AI Assistant (paid add-on) | AI plugin exists; no layout-aware hooks |

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

> The core barrel imports `y-webrtc` and `y-websocket` at load time (they are
> declared as *optional* peers, so npm will not install them for you). Install
> them explicitly — `npm install y-webrtc y-websocket` — otherwise strict ESM
> runtimes and bundlers (Vite / Rollup / esbuild) fail to resolve the barrel even
> when `collaboration` is turned off. The providers are only instantiated once
> `collaboration` is enabled.

---

### Vue 3

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
  import { registerDocsEditor } from '@kedataindo/docflow-element'
  import { defaultPlugins } from '@kedataindo/docflow-plugins'

  registerDocsEditor() // defines <docs-editor>; auto-registration is intentionally off

  // module scripts are deferred, so the element below is already in the DOM
  document.querySelector('docs-editor').plugins = defaultPlugins
</script>

<docs-editor
  room="my-doc"
  content='{"type":"doc","content":[]}'
></docs-editor>
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
| `@kedataindo/docflow-export` | DOCX / ODT / RTF / Markdown export | Any framework |

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

<!-- api:props:begin -->
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `object \| string` | `—` | Document content (ProseMirror JSON). Two-way bound via `v-model`. |
| `plugins` | `DocsEditorPlugin[]` | `[]` | Active plugins — usually `defaultPlugins` from `@kedataindo/docflow-plugins`. |
| `editable` | `boolean` | `true` | Let the user edit the document. Reactive after mount: toggling it calls `editor.setEditable()` instead of requiring a remount. |
| `collaboration` | `CollaborationOptions \| CollaborationSetup` | `—` | Collaboration config (`room`, `provider`, `user`) — the host owns the transport. |
| `pageSize` | `string` | `'a4'` | Page size id (`a4`, `f4`, `letter`, `legal`, `a5`). Reactive after mount: changing it re-lays out the paper instead of requiring a remount. |
| `pageless` | `boolean` | `false` | Continuous mode: disables pagination so the document flows without page breaks. |
| `virtualPages` | `boolean` | `false` | Enable virtual page overlay (experimental). When true, only visible pages are rendered in DOM instead of all pages. Uses PageLayout for measurement + viewport-based visibility tracking. |
| `title` | `string` | `'Untitled Document'` | Document title shown in the header bar. |
| `collaborators` | `Collaborator[]` | `[]` | Other users shown as the presence avatar stack in the header. |
| `starred` | `boolean` | `false` | Star toggle state shown in the header bar. |
| `connectionState` | `ConnectionState` | `'connected'` | Connection indicator rendered in the status bar. |
| `userName` | `string` | `''` | Display name of the current user. |
| `userAvatar` | `string` | `''` | Avatar fallback (initials) for the current user. |
| `locale` | `Locale` | `—` | UI language for the editor chrome (`en` or `id`). |
| `documentMeta` | `DocumentMeta` | `—` | Document metadata (id, owner, timestamps, counts) shown in the Details dialog. |
| `shareUrl` | `string` | `''` | Link used by the share-via-email dialog. |
| `onImageUpload` | `ImageUploadHandler` | `—` | Async handler for pasted/dropped images; returns the stored `src`. The host owns storage. |
| `citation` | `CitationPort` | `—` | Citations port: CSL-JSON sources + active style. The host supplies the data. |
| `aiStream` | `AIStreamFn` | `—` | Streaming AI handler — the host calls its own LLM. |
| `aiDraft` | `AIDraftFn` | `—` | Draft-generation handler used by the AI sidebar — the host calls its own LLM. |
| `debug` | `boolean` | `false` | Enable the debug overlay (CPU + RAM monitor) pinned to the bottom-right corner of the viewport. Pure debug view — never touches document state. Defaults to `false`, so production consumers are unaffected. Read once at mount: the monitor is created together with the editor, so changing this prop later requires a remount (`:key`). |
| `comments` | `CommentItem[]` | `[]` | Comment threads. The library stays free of REST; the host feeds the threads + handles the events. |
| `selectedTextSnippet` | `string` | `''` | Currently-selected text snippet. |
| `selectedTextIndex` | `number` | `—` | Currently-selected start position. |
| `snapshots` | `DocumentSnapshot[]` | `[]` | Version history. The host feeds the version list + handles save/restore/preview events (it owns the REST surface). |
| `activePreviewIndex` | `number \| null` | `null` | Index of the snapshot currently previewed in the history sidebar. |
| `orientation` | `'portrait' \| 'landscape'` | `'portrait'` | Page orientation: 'portrait' or 'landscape'. Persisted by the host. |
| `margins` | `{ top: number; bottom: number; left: number; right: number }` | `{ top: 94, bottom: 94, left: 94, right: 94 }` | Page margins in points. Persisted by the host. |
| `headerMarginCm` | `number` | `0.5` | Distance from the paper edge to the header/footer content, in cm. |
| `footerMarginCm` | `number` | `0.5` | Distance from the bottom paper edge to the footer content, in cm. |
<!-- api:props:end -->

### Events

<!-- api:emits:begin -->
| Event | Payload | Description |
|-------|---------|-------------|
| `update:modelValue` | `value: object` | Document content changed (`v-model`). |
| `update:title` | `title: string` | Document title changed. |
| `update:pageSize` | `pageSize: string` | Page size changed. |
| `update:orientation` | `orientation: 'portrait' \| 'landscape'` | Page orientation changed. |
| `update:margins` | `margins: { top: number; bottom: number; left: number; right: number }` | Page margins changed (points). |
| `update:header-footer-margins` | `margins: { headerMarginCm: number; footerMarginCm: number }` | Header/footer margin offsets changed (cm). |
| `update:pageless` | `pageless: boolean` | Pageless (continuous) mode was toggled. |
| `update:pageCount` | `pageCount: number` | The rendered page count changed. |
| `update:locale` | `locale: Locale` | UI language changed. |
| `citation-sources-change` | `sources: CslItemData[]` | The citation source list changed. |
| `update:citation-style` | `style: string` | The active CSL style changed. |
| `toggle-star` | — | The star toggle was clicked. |
| `back` | — | The back button was clicked. |
| `share` | — | The share button was clicked. |
| `menu-click` | `menu: string` | A header menu entry was activated; `menu` holds the action id. |
| `export` | `format: 'markdown' \| 'html' \| 'html-zip' \| 'txt' \| 'docx' \| 'pdf' \| 'odt' \| 'rtf'` | The user requested an export in the given `format`. |
| `ready` | `docsEditor: DocsEditor` | The editor instance is ready. |
| `add-comment` | `content: string, anchorText?: string, anchorIndex?: number` | The user submitted a new comment thread. |
| `add-reply` | `threadId: string, content: string` | The user replied to a comment thread. |
| `resolve-comment` | `threadId: string` | The user resolved a comment thread. |
| `delete-comment` | `threadId: string` | The user asked to delete an orphaned comment thread. |
| `save-snapshot` | `name: string` | The user saved a version snapshot. |
| `restore-snapshot` | `versionIndex: number` | The user restored the snapshot at `versionIndex`. |
| `preview-snapshot` | `snapshot: DocumentSnapshot \| null` | The user previewed a snapshot (or cleared the preview with `null`). |
<!-- api:emits:end -->

### Slots

| Slot | Description | Slot props |
|------|-------------|------------|
| `#header-actions` | Custom buttons in the header bar | — |
| `#overflow-actions` | Extra items in the header overflow menu | `close()` |
| `#user-menu` | Custom content in the user menu | `close()` |

> Props and events above are **generated** from
> `packages/vue/src/components/docsEditorContracts.ts` — the single source of truth.
> After changing that contract run `pnpm docs:api` to regenerate
> (`pnpm docs:api:check` fails when the README is stale).

### Web Component Attributes

```html
<docs-editor
  room="doc-123"
  theme="light|dark"
  editable="true|false"
  content='{"type":"doc","content":[]}'
  websocket-url="wss://..."
  debug="true|false"
></docs-editor>
```

JS properties on the element: `plugins`, `onImageUpload` (everything else is an
attribute — see `observedAttributes` in `DocsEditorElement`).

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
import { defaultPlugins } from '@kedataindo/docflow-plugins'

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

- [GitHub Discussions](https://github.com/Kedata-Indonesia/docflow/discussions) — questions, RFCs, and **showcase** what you built
- [Issues](https://github.com/Kedata-Indonesia/docflow/issues) — bugs and feature requests
- Live demo: https://dev-docflow-web.kedata.cloud

Full channel list and our code of conduct: [docs/COMMUNITY.md](./docs/COMMUNITY.md).

## Contributing

Contributions are welcome — bug reports, RFC discussions, and pull requests. `main` is protected: fork the repo, create a branch, and open a PR. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup, verification steps, and PR expectations, and open an issue first for anything non-trivial so we can align on direction.

## Development

```bash
git clone git@github.com:Kedata-Indonesia/docflow.git
cd docflow
pnpm install
pnpm build
pnpm typecheck        # TypeScript
pnpm test:unit        # Unit test
pnpm lint             # ESLint
```

> The deployable application (web UI + API server) and its Docker stack live in the
> separate [`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app) repository.

### Playground

`examples/playground` is a small backend-free Vite app that mounts `<DocsEditor>`
**through the public API only** (`defaultPlugins`, props, events). Use it to review
UI changes, compare branches, or copy a working setup.

It is tracked in this repo, so a fresh clone can run it directly:

```bash
pnpm install

pnpm build && pnpm dev                       # dist mode — http://localhost:5200
# edit packages/* with HMR instead of rebuilding:
pnpm dev:source
```

Regenerate the README demo GIF from a running playground with
`node scripts/record-demo.mjs` (writes `docs/assets/docflow-demo.gif`).

It owns its fixtures (documents, comment threads, versions, collaborators) in
memory — no server, no database, nothing published. To reset a locally modified
harness back to the committed version, run `pnpm playground:restore --force`.

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
│   └── playground/        backend-free demo app (tracked, not published)
└── docs/                  Documentation
```

## Releasing

Packages are published **automatically when `main` is updated**: a push (e.g. a merged PR) verifies, patch-bumps the packages it touched — plus their dependents — builds, and publishes them to the public **npm** registry under `@kedataindo/docflow-*` (the in-repo source scope stays `@kedata-indonesia`). The bump is committed back to `main` automatically, so merging is all it takes. A `v*` tag runs the same flow without the auto-bump. See [docs/PUBLISH.md](./docs/PUBLISH.md) for the full guide.

```bash
# Merge your change into main — that's it.
git push
# → CI verifies, patch-bumps what changed, publishes, and commits the bump back
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
