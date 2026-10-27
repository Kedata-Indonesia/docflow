# @kedataindo/docflow-export

Document export for [DocFlow](https://github.com/Kedata-Indonesia/docflow), an open-source rich text editor — DOCX, ODT, RTF, Markdown, and print-ready HTML from ProseMirror JSON.

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

## Citations and bibliography

Pass a `citation` port to render citation-backed content:

- `renderCitation(citationId)` — inline citation / footnote body
- `getReferenceList()` — cited-only entries (the `referenceList` block)
- `getBibliography()` — every saved source (the `bibliography` block)

DOCX and print (`window.print()`) render both blocks. **ODT/RTF do not currently render citation/bibliography blocks** — documented limitation.

## Equations

LaTeX equations (`inlineEquation` / `displayEquation`) are exported as:

- **DOCX** — native Word equations (OMML) via `docx`'s LaTeX converter, with a fallback to the italic LaTeX source for unsupported constructs. Numbered display equations export their derived `(n)` label.
- **Markdown** — `$…$` for inline and `$$…$$` for display.
- **HTML / ODT / RTF** — self-contained MathML (no stylesheet needed); display numbers are appended.
- **TXT** — the LaTeX source text.
- **PDF** — `window.print()` renders the live editor node views (KaTeX + numbers).

ODT/RTF do not typeset math natively; they receive the MathML/source text as a best-effort fallback.

## Documentation

[github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
