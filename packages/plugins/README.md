# @kedataindo/docflow-plugins

Built-in plugins for [DocFlow](https://github.com/Kedata-Indonesia/docflow), an open-source rich text editor — tables, footnotes, citations, comments, and page breaks.

## Install

```bash
npm install @kedataindo/docflow-plugins
```

## Usage

```ts
import { defaultPlugins } from '@kedataindo/docflow-plugins'
// pass to <DocsEditor :plugins="defaultPlugins">, createEditor(), or <docs-editor>
```

`defaultPlugins` is the 24-plugin built-in set: text formatting, headings, lists (bullet, ordered, task), text alignment, link, image, tables, table page splitting, blockquote, code block, equations (LaTeX via KaTeX), placeholder, page break, footnotes, table of contents, font size, font family, text color, highlight, citations, AI, comments, suggested changes, and smart elements. Bold, italic, and strike come from the core StarterKit base schema, not from a plugin.

The citations plugin adds three nodes — `CitationNode` (inline), `ReferenceListNode` (cited-only list), and `BibliographyNode` (every saved source) — plus the `insertCitation` / `insertReferenceList` / `insertBibliography` actions (toolbar and slash).

`slashMenuPlugin` (the `/` command menu) is exported separately and is **not** part of `defaultPlugins` — add it explicitly if you want it in the toolbar set.

A second entrypoint, `@kedataindo/docflow-plugins/citations`, provides the citations & references engine (DOI/CrossRef + BibTeX/RIS import, CSL styles).

Write your own with `definePlugin` from `@kedataindo/docflow-core` — see the [plugin system docs](https://github.com/Kedata-Indonesia/docflow/blob/main/docs/reference/API.md#plugin-system).

## Documentation

[github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
