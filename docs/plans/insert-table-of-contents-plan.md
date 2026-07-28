# Plan — Insert Table of Contents (in-document TOC)

**Status:** draft for discussion — 2026-07-28
**Context:** TOC *sidebar* already shipped (T1/T2, PR #92 — live outline in `packages/vue/src/components/sidebars/TOCSidebar.vue`). This plan covers a TOC **embedded in the document body**, like Google Docs *Insert → Table of contents*.
**Reference exploration:** TOCSidebar heading extraction (`TOCSidebar.vue:58-72`), node-plugin precedent (`packages/plugins/src/footnote.ts:5-116`), insert-command flow (`HeaderBar.vue:168-183` → `DocsEditor.vue:1538-1600` → `editFormatMenuCommands`/`menuClick`).

---

## 1. Goal

User places cursor → Insert → Table of contents → a live TOC block appears in the document, listing headings H1–H3 with click-to-jump, staying up to date as the document is edited. Syncs via Yjs like any other content.

## 2. Key facts that shape the design

- Heading extraction is proven: walk `editor.state.doc.descendants`, filter `heading` level 1–3, debounce ~60 ms (`TOCSidebar.vue:44-72`).
- Plugin system supports custom nodes with plain-DOM NodeViews (`footnote.ts`, `citation.ts`, `bibliography.ts`, `pageBreak.ts` — all `addNodeView()` returning `{ dom, update }`; **no Vue NodeView precedent**, keep to plain DOM).
- The collab Yjs fragment carries the active tab's PM doc; inserting a node is a normal PM transaction that syncs (same as footnote insert, `DocsEditor.vue:1568-1594`).
- **No reactive pos→page-number index exists.** Options: DOM geometry via `coordsAtPos` vs `.rm-page-break` breakers (`DocsEditor.vue:535-580`), or `PageLayout` from `packages/layout-engine` (`PageLayout.ts:61-79` gives `pages[].blocks` with PM positions).
- **Export reads PM JSON, not NodeViews.** An atom node whose content only exists in its NodeView exports as nothing unless the export pipeline expands it (packages/export serializers walk the JSON).

## 3. Approach options

### Option A — Atom `toc` node + live plain-DOM NodeView

A block-level **atom** node (like `pageBreak`): no editable content inside; the NodeView re-scans headings on every editor `update` (debounced) and renders the list.

- ✅ Always fresh — no stale TOC, no refresh button needed.
- ❌ **Export (HTML/PDF/DOCX) sees an empty atom** — export is a core shipped feature of this product, so the TOC would be missing from exported documents until a follow-up expansion task lands.
- ❌ Page numbers require layout-engine wiring either way.

### Option B (CHOSEN) — Container `toc` node with generated entries + refresh button (GDocs-style)

A block **container** node whose content is real generated paragraphs (one per heading, indented by level, with jump links). A small ⟳ refresh button in the NodeView chrome regenerates the entries in one transaction.

- ✅ Export/print just work — the TOC is real document content from day one (decisive for this product).
- ✅ Yjs sync, undo, selection all standard; refresh is one transaction → converges across clients.
- ✅ Matches the Google Docs mental model users already know (including: users can edit entries, refresh overwrites).
- ❌ Can go stale between refreshes — mitigated by the always-visible refresh affordance on the block.

**Decision (2026-07-28): Option B**, chosen because export correctness is a core product feature and the refresh-button UX is familiar from GDocs.

## 4. Work items (Option B, v1)

### Plugin — `packages/plugins/src/toc.ts` (new; NodeView pattern from `footnote.ts`/`bibliography.ts`)
1. `TocNode = Node.create({ name: 'toc', group: 'block', content: 'paragraph+', defining: true })`
   - `parseHTML`: `[{ tag: 'div[data-toc]' }]`; `renderHTML`: `['div', { 'data-toc': '', class: 'docs-toc' }, 0]` (the `0` hole keeps generated entries in the serialized output — that is what makes export work).
   - `addNodeView()`: plain-DOM view — a contentDOM for the entries plus a chrome row ("Table of contents" caption + ⟳ refresh button, `contenteditable: false`). Refresh handler calls the plugin's regenerate command. Listener cleanup in `destroy()`.
   - Entry links: mark or `data-pos` attr on each entry paragraph; click (handled in the NodeView, `contenteditable: false` chrome or link click handler) → `editor.chain().focus().setTextSelection(pos).run()` + scroll-into-view (reuse `TOCSidebar.vue:146-160`). Positions are captured at generation time; jump accuracy between refreshes is best-effort (same as the sidebar).
2. Helpers in the same file:
   - `collectHeadings(editor)` — walk `editor.state.doc.descendants`, headings level 1–3, return `{ level, text, pos }[]` (sidebar algorithm, `TOCSidebar.vue:58-72`).
   - `buildTocEntries(headings)` → PM JSON paragraphs: indent via `data-level` attr (CSS handles indentation), text, link/anchor attr.
   - `regenerateToc(editor)` — find the `toc` node(s), replace their content with fresh entries in one `tr`.
3. `tocPlugin: DocsEditorPlugin` — `tiptapExtensions: [TocNode]`, slash command ("Table of contents" / "daftar isi"), `commands: { insertToc: (editor) => insert node pre-filled with generated entries; refreshToc: (editor) => regenerateToc }`.
4. Register in `defaultPlugins` (`packages/plugins/src/index.ts`).

### Menu wiring
5. `HeaderBar.vue` Insert menu: add `{ label: t('header.tableOfContents'), action: 'insert-toc' }` **at the bottom, after `insert-footnote`** (GDocs places TOC low in Insert; it groups with the structural page elements header/footer/footnote rather than the content inserts). Locale keys en: "Table of contents", id: "Daftar isi".
6. `DocsEditor.vue` `editFormatMenuCommands`: `'insert-toc': () => runPluginMenuAction('insertToc')` (precedent `:1534`).

### Styling
7. `.docs-toc` block chrome (border, caption row, refresh button) + per-level indentation — place styles where footnote/citation NodeView styles live (check `packages/vue/src/styles/index.css` for the existing precedent and keep the idiom).

### Tests (`packages/plugins/src/__tests__/`)
8. Node registered in `defaultPlugins` schema; `insertToc` inserts a prefilled `toc` node; after editing a heading, `refreshToc` rewrites entries to match; entry paragraphs survive an export-JSON round-trip (`editor.getJSON()` contains the entries — the export-correctness invariant).

## 5. Follow-ups (explicitly out of v1)

- **v2 — page numbers** (GDocs "with page numbers" style): wire `PageLayout` (layout-engine) to produce a pos→page map and render page numbers beside entries at generation time; revisit `BlockAttributesExtension`'s unused `getPageMap` hook (`BlockAttributes.ts:43-46`, currently passed an empty map at `DocsEditor.vue:327`).
- **v2 — auto-refresh affordance**: optional "refresh on open/print" behavior.
- **v2 — TOC in non-active tabs**: v1 mirrors the collab fragment scope (active tab only).

## 6. Acceptance gate

- Insert → Table of contents inserts a prefilled block at the cursor.
- Edit a heading → block shows stale entry → click ⟳ → entries match the current headings (and a second client sees the same regenerated block — refresh converges via Yjs).
- Clicking an entry jumps + scrolls to the heading.
- `editor.getJSON()` (and therefore export) contains the TOC entries.
- Typecheck + unit tests green; verified in browser on localhost.

## 7. Estimation

Small-medium — one plugin file (~220 lines: node + NodeView + helpers), ~20 lines of menu/command wiring, locale keys, styles, tests. About a day including browser verification.
