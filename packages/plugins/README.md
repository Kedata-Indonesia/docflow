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

`defaultPlugins` includes: bold, italic, underline, strike, heading, bulletList, orderedList, taskList, blockquote, codeBlock, link, image, table, textAlign, placeholder, pageBreak, fontSize, slashMenu, footnote, and more.

A second entrypoint, `@kedataindo/docflow-plugins/citations`, provides the citations & references engine (DOI/CrossRef + BibTeX/RIS import, CSL styles).

Write your own with `definePlugin` from `@kedataindo/docflow-core` — see the [plugin system docs](https://github.com/Kedata-Indonesia/docflow#plugin-system).

## Documentation

[github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
