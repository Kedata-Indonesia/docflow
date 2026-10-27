# API reference

Props, events, slots, and the other public entry points. The root README stays short on purpose — start there if you are deciding whether to use DocFlow.

Integration guides: [Vue, Web Component, headless](../guides/INTEGRATION.md) · [collaboration](../guides/COLLAB_INTEGRATION.md) · [AI](../guides/EMBEDDING_AI.md) · [library/app boundary](./LIBRARY_CONTRACT.md).

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
| `modelValue` | `object \| string` | `—` | Document content: a ProseMirror JSON document or a tabbed document. Two-way via `v-model` — writes after mount replace the document (snapshot restore, switching documents). Edits emit on a ~300 ms trailing debounce, flushed on blur and unmount; discrete changes (header/footer, commands) still emit immediately. Echoes of the editor's own emission are ignored, and collaboration mode ignores host writes because Yjs owns the document there. |
| `plugins` | `DocsEditorPlugin[]` | `[]` | Active plugins — usually `defaultPlugins` from `@kedataindo/docflow-plugins`. |
| `editable` | `boolean` | `true` | Let the user edit the document. Reactive after mount: toggling it calls `editor.setEditable()` instead of requiring a remount. |
| `mode` | `DocumentMode` | `—` | Document mode (issues #27/#28): `editing` (default) · `suggesting` (edits become suggestions) · `viewing` (read-only). Supersedes `editable` when set; `editable === false` maps to `viewing`. Reactive — switching does not remount. |
| `theme` | `DocsTheme` | `—` | Editor theme. `light`/`dark` scopes the theme to this editor instance: the `dark` class is applied to the editor root (never to the host page), so it also works inside Shadow DOM. Omit it for the auto document-level theme (localStorage / prefers-color-scheme). |
| `canReviewSuggestions` | `boolean` | `true` | Whether the track-changes review UI may accept/reject suggestions (issues #27/#28). Defaults to `true`; hosts pass `false` for viewer roles. |
| `collaboration` | `CollaborationOptions \| CollaborationSetup` | `—` | Collaboration config (`room`, `provider`, `user`) — the host owns the transport. |
| `pageSize` | `string` | `'a4'` | Page size id (`a4`, `f4`, `letter`, `legal`, `a5`). Reactive after mount: changing it re-lays out the paper instead of requiring a remount. |
| `pageless` | `boolean` | `false` | Continuous mode: disables pagination so the document flows without page breaks. |
| `zoom` | `number` | `100` | Rendered zoom of the page surface, in percent (50–200, default 100). Reactive: the paper and its content scale visually while the layout (and therefore pagination) stays at 100 %. Disabled/pinned to 100 while `virtualPages` is on. |
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
| `citation` | `CitationPort` | `—` | Citations port: CSL-JSON sources + active style, and optionally extra CSL styles (`styles`) the host supplies itself — a hosted/institutional style then appears in the reference sidebar's picker next to the four the library bundles, with no change to the library. The host supplies the data. |
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
| `unimplementedActions` | `Array<string \| { action: string; reason?: string }>` | `[]` | Actions this host does not implement. Dimmed (still visible), `aria-disabled="true"`, `reason` becomes the tooltip. (issue #153) |
| `confirmDestructive` | `ConfirmDestructiveFn` | `—` | Confirmation for destructive actions inside the library (delete a reference source, delete a comment thread). When supplied, the host's dialog decides and the library's built-in dialog is never rendered. Resolve `true` to proceed, `false`/reject to cancel. |
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
| `update:zoom` | `zoom: number` | The page-surface zoom changed (percent). |
| `update:mode` | `mode: DocumentMode` | Document mode changed (issues #27/#28). |
| `update:pageCount` | `pageCount: number` | The rendered page count changed. |
| `update:locale` | `locale: Locale` | UI language changed. |
| `citation-sources-change` | `sources: CslItemData[]` | The citation source list changed. |
| `update:citation-style` | `style: string` | The active CSL style changed. |
| `citation-style-imported` | `style: CslStyleInfo` | A `.csl` style was imported and registered for this session. Hosts that want it after a reload persist this object and re-supply it through `citation.styles` on the next mount. |
| `citation-style-removed` | `styleId: string` | An imported style was removed. Hosts drop it from whatever they persist (the per-document style list) so it does not come back on the next mount. |
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
> (`pnpm docs:api:check` fails when this file is stale).

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

`theme` is optional. When set, it is scoped to that element (the `dark` class goes on
the editor root, not the host page), so it works inside Shadow DOM and multiple
embeds stay independent. Without it the editor follows the document-level auto
theme (`localStorage` / `prefers-color-scheme`).

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
