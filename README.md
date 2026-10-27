# DocFlow

Open-source rich text editor with true page layout (A4/A5, page breaks) and real-time collaboration. TipTap/ProseMirror + Vue 3 + Yjs. Apache-2.0.

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License: Apache-2.0"></a>
  <a href="https://www.npmjs.com/package/@kedataindo/docflow-core"><img src="https://img.shields.io/npm/v/@kedataindo/docflow-core" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@kedataindo/docflow-core"><img src="https://img.shields.io/npm/dm/@kedataindo/docflow-core" alt="npm downloads"></a>
  <a href="https://github.com/Kedata-Indonesia/docflow/actions/workflows/publish.yml"><img src="https://github.com/Kedata-Indonesia/docflow/actions/workflows/publish.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/built%20on-TipTap%20%2B%20Yjs%20%2B%20Vue-blueviolet" alt="Built on TipTap + Yjs + Vue">
</p>

<p align="center">
  <a href="https://docflow-app.kedata.cloud"><b>Live demo</b></a> ·
  <a href="https://docflow.kedata.cloud"><b>Website</b></a> ·
  <a href="./docs/README.md"><b>Docs</b></a> ·
  <a href="./docs/reference/API.md"><b>API</b></a>
</p>

<p align="center">
  <img src="./docs/assets/docflow-demo.gif" alt="DocFlow — paginated rich text editor with page breaks, page numbers, and collaborator presence" width="900">
</p>

Also a Web Component and a headless core, if you are not on Vue.

> This repository is the **library packages** only (`@kedataindo/docflow-*`). The deployable app and the Cloud platform are licensed separately — try them in the [live demo](https://docflow-app.kedata.cloud).

## Install

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
</script>

<template>
  <DocsEditor :model-value="content" :plugins="defaultPlugins" />
</template>
```

Web Component, headless, and collaboration: [integration guide](./docs/guides/INTEGRATION.md).

## Why DocFlow?

Page layout, footnotes, and citations are in the Apache-2.0 libraries. TipTap and CKEditor charge for them. OnlyOffice has them, and is AGPL and heavy.

| | DocFlow | TipTap | CKEditor 5 | OnlyOffice |
|---|---------|--------|------------|------------|
| Footnotes (page-anchored) | Built-in | Pages (paid) | Premium, and grouped as endnotes | Full suite |
| Citations + bibliography (CSL) | Built-in (APA, MLA, Chicago) | Not included | Not included | Zotero / Mendeley plugin |
| A4 pagination, headers, footers | Built-in | Pages (paid) | Premium plugin | Full suite |
| Real-time collaboration | Yjs, self-hostable | Hocuspocus is OSS; Collab cloud is paid | Premium | Yes |
| License | Apache-2.0 libraries; app + Cloud are licensed | MIT core; Pro is paid | GPL / commercial | **AGPL** |
| Embed | npm packages | npm packages | npm packages | iframe |
| Layout-aware AI | Hooks included; you bring the model | Paid add-on | Paid add-on | No layout-aware hooks |

If you don't need pages, use TipTap. If you need a code editor, use Monaco or CodeMirror. If you need a full office suite with a server, OnlyOffice is the closer fit.

## Packages

| Package | What it is |
|---------|------------|
| `@kedataindo/docflow-vue` | Vue 3 component. Start here. |
| `@kedataindo/docflow-element` | `<docs-editor>` Web Component |
| `@kedataindo/docflow-core` | Headless editor + plugin system |
| `@kedataindo/docflow-plugins` | Tables, images, footnotes, citations, page breaks |
| `@kedataindo/docflow-export` | DOCX, ODT, RTF, Markdown |
| `@kedataindo/docflow-layout-engine` | Pagination. You normally don't install this. |

## Docs

- [API reference](./docs/reference/API.md) — props, events, slots, plugins
- [Integration](./docs/guides/INTEGRATION.md) · [Collaboration](./docs/guides/COLLAB_INTEGRATION.md) · [AI hooks](./docs/guides/EMBEDDING_AI.md)
- [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Discussions](https://github.com/Kedata-Indonesia/docflow/discussions)

**Apache-2.0** — see [LICENSE](./LICENSE). Third-party pieces keep their own licenses — see [NOTICE](./NOTICE). Questions: [info@kedata.online](mailto:info@kedata.online).

<p align="center">Made with ♥ by <a href="https://kedata.cloud">Kedata</a> in Indonesia</p>
