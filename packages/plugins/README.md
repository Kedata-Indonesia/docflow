# @kedataindo/docflow-plugins

Built-in plugins for [DocFlow](https://github.com/Kedata-Indonesia/docflow) — the open-source editor engine for document-style apps.

## Install

```bash
npm install @kedataindo/docflow-plugins
```

## Usage

```ts
import { defaultPlugins } from '@kedataindo/docflow-plugins'
// pass to <DocsEditor :plugins="defaultPlugins">, createEditor(), or <docs-editor>
```

`defaultPlugins` is the 21-plugin built-in set: underline, headings, lists (bullet, ordered, task), text alignment, link, image, tables, table page splitting, blockquote, code block, placeholder, page break, footnotes, table of contents, font size, text color, highlight, citations, AI, comments, and smart elements. Bold, italic, and strike come from the core StarterKit base schema, not from a plugin.

`slashMenuPlugin` (the `/` command menu) is exported separately and is **not** part of `defaultPlugins` — add it explicitly if you want it in the toolbar set.

A second entrypoint, `@kedataindo/docflow-plugins/citations`, provides the citations & references engine (DOI/CrossRef + BibTeX/RIS import, CSL styles).

Write your own with `definePlugin` from `@kedataindo/docflow-core` — see the [plugin system docs](https://github.com/Kedata-Indonesia/docflow#plugin-system).

## Documentation

[github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
