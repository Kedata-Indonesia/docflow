# Citation Style Language (CSL) assets — attribution

The TypeScript files in this directory embed **Citation Style Language (CSL)**
style definitions and the **en-US CSL locale**. They are generated, verbatim,
from the official Citation Style Language repositories and are **not** original
DocFlow code.

## Source

- Styles: <https://github.com/citation-style-language/styles>
- Locales: <https://github.com/citation-style-language/locales>
- Style Variant Builder: <https://github.com/citation-style-language/style-variant-builder>

## Bundled files and upstream sources

| File | Upstream source |
|------|-----------------|
| `apa.ts` | `apa.csl` (American Psychological Association) |
| `chicagoAuthorDate.ts` | `chicago-author-date.csl` |
| `chicagoNotesBibliography.ts` | `chicago-notes-bibliography.csl` |
| `modernLanguageAssociation.ts` | `modern-language-association.csl` (MLA Handbook 9th ed.) |
| `localesEnUS.ts` | `locales-en-US.xml` |

Each source file embeds the upstream `<rights>` declaration from its CSL
definition, e.g.:

```xml
<rights license="http://creativecommons.org/licenses/by-sa/3.0/">
  This work is licensed under a Creative Commons Attribution-ShareAlike 3.0 License
</rights>
```

## License

These data files are distributed under
**Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)**.
The full legal code is reproduced in
[`LICENSE-CC-BY-SA-3.0`](./LICENSE-CC-BY-SA-3.0) and at
<https://creativecommons.org/licenses/by-sa/3.0/legalcode>.

The Apache-2.0 license of the rest of DocFlow does **not** apply to these
files and does **not** alter their CC BY-SA 3.0 terms.

## Share-alike obligations (summary — not legal advice)

If you redistribute or adapt these CSL data files (including as part of a
compiled bundle), you must:

1. **Attribute** the Citation Style Language project and the individual style
   authors (the authors are listed in the `<author>` / `<contributor>` elements
   of each style).
2. **Indicate the license** (CC BY-SA 3.0) and link to its text.
3. **Keep it share-alike**: adaptations of these files must be released under
   CC BY-SA 3.0 (or a compatible license).
4. **Not imply endorsement** by the Citation Style Language project or by the
   individual style authors.

## Notes for DocFlow maintainers

- Do not hand-edit the generated files; regenerate them from upstream and keep
  this attribution file in sync.
- When adding a new style, add its upstream source to the table above and keep
  the embedded `<rights>` element intact.
- Because these files are compiled into `dist/`, the attribution also ships to
  npm consumers via `../../CSL-LICENSES.md`.
