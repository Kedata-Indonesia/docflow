# @kedataindo/docflow-export

Document export for [DocFlow](https://github.com/Kedata-Indonesia/docflow) — DOCX, ODT, RTF, Markdown, and print-ready HTML from ProseMirror JSON.

> **Status:** not published on npm yet — `npm install @kedataindo/docflow-export`
> returns 404 until the next tagged release. Build it from source in the meantime:
> `pnpm --filter @kedata-indonesia/docflow-export build`.

## Install

```bash
npm install @kedataindo/docflow-export
```

## Usage

```ts
import { exportDocument } from '@kedataindo/docflow-export'

await exportDocument('docx', editor, 'My Document')
// formats: 'docx' | 'odt' | 'rtf' | 'pdf' | 'markdown' | 'html' | 'html-zip' | 'txt'
```

Lower-level helpers (`exportDocx`, `generateOdt`, `generateRtf`, `jsonToMarkdown`, `plainTextFromHtml`) are exported for custom pipelines.

## Documentation

[github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
