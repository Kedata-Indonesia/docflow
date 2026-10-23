# DocFlow library — re-audit (2026-10-23)

**Date:** 2026-10-23
**Commit:** `67b76b0` (`main`)
**Previous audit:** [2026-10-22](./2026-10-22-code-audit.md) at `50b0deb`
**Scope:** `packages/*` (core, layout-engine, plugins, vue, element, export), build/CI, docs tooling
**Reviewer:** AI agent (DeepSeek V4.1 Flash), `ponytail-audit`
**Status:** snapshot. Track the work in GitHub issues; do not edit this report after merge.

---

## What changed since the last audit

`main` moved from `50b0deb` to `67b76b0`. The code changes since the previous review are:

- **#359 — in-app confirmation dialog** (`ConfirmDialog.vue`, `confirmDestructive` prop,
  Comments/References sidebar call sites).
- **#360/#361 — CSL style lifecycle** (`parseCslStyle`, `CiteEngine.registerStyle/removeStyle`,
  `useCitations` import/remove flow).
- **#365 — docs reorganisation** plus `scripts/check-docs-links.mjs` and the `docs:check` gate.
- Release bumps only otherwise.

New code was reviewed in full. `ConfirmDialog`, the citation lifecycle, and the docs link gate
have **no blocking issue**; the five new findings below are in older code that had not been read
line by line.

**Tests:** `pnpm -r run test:unit` — **91 files / 623 tests pass** (core 161, export 38,
layout-engine 24, plugins 169, vue 225, element 6). `pnpm docs:check` and `pnpm docs:api:check`
pass. Playwright e2e, lint and typecheck were not run.

**Load assumed:** one editor per browser tab, 1–100 page documents, 2–10 collaborators, continuous
typing. No server code lives here.

---

## Carried over — all 14 still reproduce

Each finding below was re-checked against the code at `67b76b0`; none was fixed by the merged PRs.

| # | Finding | Issue | Severity |
|---|---|---|---|
| 1 | RTF export mangles non-ASCII / unescaped title | [#368](https://github.com/Kedata-Indonesia/docflow/issues/368) | Must fix |
| 2 | `<docs-editor>` throws on reconnect | [#369](https://github.com/Kedata-Indonesia/docflow/issues/369) | Must fix |
| 3 | Host `modelValue` ignored after mount (`v-model` one-way) | [#370](https://github.com/Kedata-Indonesia/docflow/issues/370) | Must fix |
| 4 | DOCX drops empty paragraphs | [#371](https://github.com/Kedata-Indonesia/docflow/issues/371) | Should fix |
| 5 | `collaborationExtensions(options)` leaks a provider | [#372](https://github.com/Kedata-Indonesia/docflow/issues/372) | Should fix |
| 6 | Virtual pages stay bound to a destroyed editor | [#373](https://github.com/Kedata-Indonesia/docflow/issues/373) | Should fix |
| 7 | Whole document serialized/emitted per keystroke | [#374](https://github.com/Kedata-Indonesia/docflow/issues/374) | Should fix |
| 8 | `theme` attribute is a no-op | [#375](https://github.com/Kedata-Indonesia/docflow/issues/375) | Should fix |
| 9 | 250 ms virtual-pages poll | [#376](https://github.com/Kedata-Indonesia/docflow/issues/376) | Nice to have |
| 10 | Full DOM clone per layout | [#377](https://github.com/Kedata-Indonesia/docflow/issues/377) | Nice to have |
| 11 | Duplicate sanitizer helpers | [#378](https://github.com/Kedata-Indonesia/docflow/issues/378) | Nice to have |
| 12 | Dead `PageLayout.observe()` | [#379](https://github.com/Kedata-Indonesia/docflow/issues/379) | Nice to have |
| 13 | Non-Latin export filenames lost | [#380](https://github.com/Kedata-Indonesia/docflow/issues/380) | Nice to have |
| 14 | `maxCharsPerPage` half-implemented | [#381](https://github.com/Kedata-Indonesia/docflow/issues/381) | Nice to have |

---

## New findings

### 15. DOCX table cells lose most of their content

`packages/export/src/docx/table.ts:4-50` · [#382](https://github.com/Kedata-Indonesia/docflow/issues/382)

**What this is.** `cellToParagraph` copies only plain text from a cell's `paragraph`/`text`
children into one `Paragraph`. `tableToDocxTable` builds every cell from that function and never
passes the export's `walkCtx`.

**Problem.** A cell containing a **citation**, **footnote**, equation, image, bullet/numbered
list, or nested table exports empty or with that content missing. Bold/italic/link marks become
plain text; multiple paragraphs are concatenated without breaks. `colspan`/`rowspan` are ignored,
so merged header cells become separate cells and shift the table shape. The library has no table
export test at all.

**Fix.** Map each cell child with the existing `mapBlockNode`/`inlineNodesToRuns` (pass
`walkCtx`), forward `columnSpan`/`rowSpan` to `TableCell`, and add a test with a citation, a
nested list and a colspan header.

**If we skip it.** Exported tables silently lose content and structure.

### 16. WebP and SVG images are labelled JPEG in DOCX

`packages/export/src/docx/image.ts:24` · [#383](https://github.com/Kedata-Indonesia/docflow/issues/383)

**What this is.** `type: mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : 'jpg'`.

**Problem.** The app's upload allowlist includes `image/webp` and `image/svg+xml`, and the web
export's `resolveImage` returns the real `blob.type`. The bytes are embedded as a JPEG when they
are not; Word shows a broken image or offers to repair the file.

**Fix.** Map the mime explicitly; convert WebP to PNG before embedding (canvas) or fall back to
the existing `[Image failed…]` text for unsupported types; never mislabel unknown bytes as
`jpg`. Add png/webp image tests.

**If we skip it.** Any document using a WebP photo exports with a corrupt image.

### 17. AI streaming stops silently on CRLF or multi-line SSE

`packages/core/src/ai/openaiCompatibleProvider.ts:99-109`,
`packages/core/src/ai/claudeProvider.ts:133-146` · [#384](https://github.com/Kedata-Indonesia/docflow/issues/384)

**What this is.** Both providers split events on `'\n\n'` and parse every `data:` line as
standalone JSON.

**Problem.** SSE permits CRLF line endings and multi-line `data:` fields. A server that emits
`\r\n\r\n` never matches `'\n\n'`, so the parser yields no deltas and then a `done` — the UI shows
an empty answer. Multi-line JSON is split into invalid fragments and silently dropped by the
`catch`.

**Fix.** Normalise `\r\n` → `\n` before scanning (or split on `\r?\n\r?\n`), and concatenate a
block's `data:` lines with `\n` before `JSON.parse`. Add one CRLF test and one multi-line test per
provider.

**If we skip it.** AI silently returns nothing against a compliant proxy or self-hosted server.

### 18. Ordered lists always start at 1 in DOCX

`packages/export/src/docx/nodes.ts:153-161` · [#385](https://github.com/Kedata-Indonesia/docflow/issues/385)

**What this is.** `listToParagraphs` starts its counter at `level = 0` and never reads
`orderedList.attrs.start`.

**Problem.** A list with `start: 5` exports as `1.`, `2.`, … Nested ordered lists also restart at
1. In step-by-step procedures this changes the meaning.

**Fix.** Seed the counter with `(node.attrs?.start ?? 1) - 1`; add a list test with a non-default
start.

**If we skip it.** Exported procedures and numbered clauses are renumbered.

### 19. Focus falls to `<body>` after a destructive confirm

`packages/vue/src/components/ConfirmDialog.vue:33-40, 91-105` · [#386](https://github.com/Kedata-Indonesia/docflow/issues/386)

**What this is.** The dialog remembers the trigger as `previouslyFocused` and focuses it when it
closes. On confirm, the parent removes the trigger row (deleted comment/source) before the restore
runs.

**Problem.** `.focus()` on a detached element does nothing, so the dialog closes and keyboard
focus drops to the document body. Keyboard and screen-reader users lose their place after every
delete — a regression from `window.confirm`, which returned to the trigger while it still existed.

**Fix.** If `previouslyFocused` is not `isConnected`, focus a stable fallback after `nextTick`
(the sidebar heading or list container), or let the caller pass a fallback element.

**If we skip it.** A destructive action leaves focus nowhere; the next Tab starts from the top of
the page.

---

## Verification performed

| Check | Result |
|---|---|
| `pnpm -r run test:unit` | 91 files / 623 tests pass |
| `pnpm docs:check` | 34 files, no broken links |
| `pnpm docs:api:check` | README API tables up to date (35 props / 28 emits) |
| Re-check of the 14 previous findings | All still reproduce at `67b76b0` |
| New code review | `ConfirmDialog`, CSL lifecycle, docs gate — no blocking issue |

## Not checked

- Playwright e2e (not run).
- Lint and typecheck (not run).
- CSS/theming and the web component's shadow-DOM dark mode.
- `examples/playground` runtime behaviour.
- The proprietary application (`docflow-app`) — audited separately on 2026-10-23.

## Verdict

The two merged features are sound; the backlog did not shrink. Fix the three must-fix findings
(RTF encoding, element reconnect, ignored `modelValue`) before adding features, then the two DOCX
fidelity bugs (table cells, WebP images).

**Lean:** −45 lines, −0 dependencies possible (unchanged from the previous audit: #378 and #379
plus the unused `maxCharsPerPage` path in #381).
