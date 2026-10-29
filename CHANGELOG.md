# Changelog

All notable changes to the DocFlow **library packages** (`packages/*`) are
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **How versioning works here.** This is a monorepo: each package
> (`@kedataindo/docflow-core`, `-layout-engine`, `-vue`, `-element`, `-plugins`,
> `-export`) is versioned and published independently, and CI patch-bumps every
> changed package on each push to `main`
> (see [`docs/operations/PUBLISH.md`](./docs/operations/PUBLISH.md)). Versions therefore do not move
> in lockstep, so entries below are grouped by **date of the change**, not by a
> single repository-wide version number.
>
> Scope: only the reusable packages are covered. The deployable application
> (web UI + API server) lives in
> `Kedata-Indonesia/docflow-app`
> and has its own history.

## [Unreleased]

### Security

- **`markdown-it` floor raised to 14.3.3 (GHSA-gfr2-rv44-r23c):** the advisory
  (quadratic-time rendering of a multi-line link reference definition) reaches
  both markdown paths we ship — `packages/export` through `prosemirror-markdown`
  and `packages/plugins` through `tiptap-markdown`. `tiptap-markdown@0.9.0` pins
  `markdown-it@14.3.2` exactly, so the override floor in
  [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) is what patches that path. CI now
  runs `pnpm audit --prod --audit-level=high`, so the next advisory of this class
  fails a pull request instead of waiting for a version sweep.

### Added

- **Offline mirror lifecycle (issue #162):** `offline: true` now has a way out.
  `purgeOfflineMirror({ room, mirrorKey? })` deletes the IndexedDB database
  without needing a live editor (logout, account switch, role downgrade, access
  revoked), and `CollaborationSetup.purgeOfflineMirror()` does the same after
  closing the live connection. `mirrorKey` lets hosts scope the mirror per
  user/tenant instead of sharing `docflow-<room>` across every identity in the
  browser profile. Purging reports `deleted | blocked | unavailable | error`
  and never hangs on a blocked delete. The mirror now emits typed
  `quota-high` / `quota-exceeded` / `mirror-unavailable` warnings through
  `onOfflineWarning` (console fallback), so unbounded growth is visible instead
  of silent. Policy and examples are in
  [`COLLAB_INTEGRATION.md`](./docs/guides/COLLAB_INTEGRATION.md#offline-mirror-luring--lifecycle-issue-162).
  _([#162](https://github.com/Kedata-Indonesia/docflow/issues/162))_

- **Removable imported CSL styles (issue #361):** the style picker can now delete
  a style the user imported. A remove control appears next to the Citation Style
  dropdown whenever the active style is one of the user's own; the bundled four
  never offer it, and the engine refuses them too (`CiteEngine.removeStyle`).
  Removing the active style falls back explicitly to the default and repaints, so
  the document never keeps naming a style that is gone. Hosts hear
  `citation-style-removed` and drop the id from their persisted style list.
  _([#361](https://github.com/Kedata-Indonesia/docflow/issues/361))_

- **In-app confirmation for destructive actions (issue #359):** deleting a
  reference source and deleting a comment thread no longer call
  `window.confirm`. Both sidebars now render a `ConfirmDialog` — a real
  `alertdialog` with `aria-labelledby`/`aria-describedby`, a focus trap,
  Escape/backdrop to cancel, focus starting on **Cancel** (never on the
  destructive button) and returning to the trigger afterwards. Labels come from
  the active locale, so the buttons read in the app's language rather than the
  browser's, and the entry animation honours `prefers-reduced-motion`. Hosts
  that already own a dialog pass the new `confirmDestructive` prop
  (`(message) => boolean | Promise<boolean>`) and the built-in one is never
  rendered — `docflow-app` can wire its existing `confirmAction` to it.
  _([#359](https://github.com/Kedata-Indonesia/docflow/issues/359))_

- **Draggable ruler margins (issue #295):** the ruler's two margin markers are no
  longer decoration — drag one to change the page margin, or focus it and use the
  arrow keys (8 px a press, 24 px with Shift). The ruler owns no state: it reports
  the margins it wants and `DocsEditor` writes them into the same ref the Page Setup
  dialog uses, so the paper re-lays out live and both controls always agree. Values
  are clamped to the dialog's 5 cm cap and never more than half the page; dragging
  is zoom-aware (a 60 px drag at 150 % is 40 layout px) and emits `update:margins`.
  Margins stay view state — the document is untouched.
  _([#295](https://github.com/Kedata-Indonesia/docflow/issues/295))_

- **Zoom control (issue #144):** the toolbar's static `100 %` button is now a
  preset dropdown (50/75/100/125/150/200 %). The page surface scales visually
  while the layout — and therefore PaginationPlus — stays at 100 %: the patched
  pagination normalizes its `getBoundingClientRect` math through
  `--docflow-zoom`, so page breaks and page counts stay correct at every zoom.
  The rulers scale and track the paper (including horizontal scroll), print
  resets the transform, and `zoom` is host-owned via the new `update:zoom` emit
  (default 100, clamped to 50–200). Virtual pages are not zoom-aware yet: the
  control is disabled and the value pinned to 100 while `virtualPages` is on.
  _([#144](https://github.com/Kedata-Indonesia/docflow/issues/144))_

- **Bibliography in the Insert menu:** when the citation plugin is loaded,
  **Insert ▸ Bibliography** (directly below Footnote) inserts the derived
  bibliography block — one per document, re-rendered from the cited sources and
  the active CSL style. It stays hidden when the citation plugin is not part of
  the plugin set.

- **Localized plugin labels:** toolbar items and slash commands can now carry a
  locale key (`labelKey` / `nameKey`) that the Vue layer resolves. The footnote
  item uses it, so the Insert dropdown and slash menu show “Footnote” in English
  and “Catatan Kaki” in Indonesian instead of the hardcoded Indonesian label.

- **Citations:** hosts can register their own CSL styles — `CitationPort.styles` /
  `CiteEngineOptions.styles` (issue #180). A style whose `id` matches a bundled one overrides
  it; any other id is added next to the four the library ships, so an institutional or
  Harvard/IEEE style no longer needs a fork. The reference sidebar's picker now lists the
  engine's registry (`CiteEngine.getAvailableStyles()`) instead of a hardcoded four, so an
  injected style is selectable. `resolveCslStyles()` is exported for hosts that build the
  engine themselves, and a malformed entry (no id, empty XML) throws up front instead of
  failing inside citeproc. Bundling is unchanged — the four defaults still render offline with
  nothing fetched, and an unknown style id still falls back to `DEFAULT_CSL_STYLE` rather than
  blanking citations. `examples/playground` injects one (`harvard-demo`) through the port as a
  live example.
  _([#180](https://github.com/Kedata-Indonesia/docflow/issues/180))_

- **Runtime CSL style import (issue #251):** the references sidebar can import a `.csl` file.
  `parseCslStyle()` derives `{ id, name, category }` from the XML, and the new
  `CiteEngine.registerStyle()` validates the style with citeproc **before** changing the
  registry — a malformed file leaves the registry, the active style and the rendered output
  untouched. The imported style appears in the Citation Style picker immediately and is
  selected; `.bst` (BibTeX) and `.ens` (EndNote) are reported as unsupported because they are
  not CSL. Hosts persist imported styles through the new `citation-style-imported` emit and
  re-supply them via `CitationPort.styles`. `parseCslStyle()` is exported from both the main
  and the `/citations` entry points.
  _([#251](https://github.com/Kedata-Indonesia/docflow/issues/251))_

- **AI credentials:** `sessionStorageKeyStorage()` — the same key/value pair as
  `localStorageKeyStorage()`, scoped to the tab so closing it drops the credential. Both
  browser storages now accept a `ttlMs` option: an entry older than the TTL is deleted and
  `get()` returns `null`. Configs stored before this release (bare `AIConfig` JSON) are still
  read, so upgrading hosts keep their key. The risk is stated in the module docblock and
  [`docs/guides/AI_PROVIDERS.md`](docs/guides/AI_PROVIDERS.md) §5, which names `httpKeyStorage` +
  `visibility: 'admin-only'` as the production path and `sessionStorage` as a *lifetime*
  bound — not an XSS mitigation (no browser storage is).
  _([#179](https://github.com/Kedata-Indonesia/docflow/issues/179))_

### Fixed

- **`collaborationExtensions` no longer leaks a live provider (issue #372):**
  the function used to accept plain `CollaborationOptions`, build a
  `CollaborationSetup` internally, and return only the TipTap extensions — the
  Y.Doc, awareness instance and room connection had no handle left to
  `destroy()`, so every mount leaked a socket and bypassed the `whenReady`
  sync gate. It now requires a `CollaborationSetup` (every internal caller
  already passed one); pass the setup you keep so you can destroy it.
  _([#372](https://github.com/Kedata-Indonesia/docflow/issues/372))_

- **First-sync gate releases its timer and listeners:** `whenProviderSynced`
  scheduled a 5 s fallback that was never cleared after a successful sync,
  pinning Node/test event loops and keeping `sync`/`synced` listeners alive for
  later reconnects. The wait now tears down both on settle, and the timeout is
  configurable via `CollaborationOptions.syncTimeoutMs` (default 5000 ms).
  _([#117](https://github.com/Kedata-Indonesia/docflow/issues/117))_

- **Host `modelValue` writes reach the editor after mount (issue #370):**
  `v-model` was one-way in practice — the prop was read once at setup and
  passed to `createEditor`, so snapshot restore, document switching, and the
  web component's `content` attribute silently kept the old document. A sync
  composable now applies post-mount writes with
  `setContent(value, { emitUpdate: false })`, updates the tab state (switching
  documents can change the active tab and its header/footer slots), and skips
  echoes of the editor's own emission so a `v-model` round-trip cannot reset
  the caret. Collaboration mode is skipped entirely: the Yjs document is
  authoritative there.
  _([#370](https://github.com/Kedata-Indonesia/docflow/issues/370))_

- **`<docs-editor>` keeps unsaved edits when the element is moved (issue #392):**
  reconnecting rebuilt the Vue editor from the `content` attribute, so anything
  typed since the host last wrote that attribute was silently discarded. The
  wrapper now remembers the document emitted through `update:modelValue` and
  reuses it while the attribute is unchanged; a host rewrite of `content` still
  wins, including one made while the element is detached.
  _([#392](https://github.com/Kedata-Indonesia/docflow/issues/392))_

- **AI streaming accepts CR-only SSE streams (issue #398):** SSE permits LF,
  CRLF, or a lone CR as line terminators, but the framing helper added in #384
  only knew the first two, so a CR-only server still produced an empty answer.
  The separator now matches all three, with a `\r(?!\n)` guard so the regex
  cannot backtrack and split one CRLF into two terminators — which would cut
  every `event:`/`data:` pair in half. Covered by tests for CR-only streams,
  CR-only multi-line data, the half-received `\r\n\r` separator, and one
  end-to-end test per provider.
  _([#398](https://github.com/Kedata-Indonesia/docflow/issues/398))_

- **AI streaming survives CRLF and multi-line SSE events (issue #384):** both
  providers split the stream on `\n\n` and parsed every `data:` line on its own.
  A compliant server using `\r\n\r\n` therefore produced no deltas — the UI
  showed an empty answer — and pretty-printed JSON spread over several `data:`
  lines was dropped by the JSON `catch`. Framing now lives in one helper
  (`takeSseEvent`) that accepts LF or CRLF separators, joins an event's `data:`
  lines with a newline, and ignores events without a payload. The OpenAI and
  Claude providers share it; `[DONE]`, `message_stop`, and `stop_reason`
  handling are unchanged.
  _([#384](https://github.com/Kedata-Indonesia/docflow/issues/384))_

- **RTF export keeps non-ASCII text and titles with braces (issue #368):** the
  writer emitted UTF-8 bytes under a `\ansicpg1252` header, so readers decoded
  them as Latin-1 — `—` became `â€”`, `café` became `cafÃ©`, and an emoji turned
  into four junk characters. Every code unit above `0x7F` is now written as a
  `\uN?` control word, with surrogate halves as signed 16-bit values so astral
  characters still round-trip. The document title goes through the same escaper,
  so a `{` or `\` in it can no longer corrupt the RTF group structure and make
  Word refuse the file. Covered by unit tests for dashes, curly quotes, accents,
  emoji, line breaks, and braces in the title.
  _([#368](https://github.com/Kedata-Indonesia/docflow/issues/368))_

- **`<docs-editor>` mounts and survives being moved (issue #369):** the wrapper
  never rendered in any browser — it built Vue's custom-element class with `new`,
  which is an `Illegal constructor` until that class is registered, so every
  mount threw before the editor appeared. The class is now registered under an
  internal tag (`docflow-docs-editor-internal`, plus a numeric suffix when a page
  already uses that name) and instantiated afterwards, which makes `new` legal and
  lets the host hand props to the constructor. `connectedCallback()` also called
  `attachShadow()` unconditionally, and the browser keeps the shadow root attached
  to the host after removal, so re-inserting the element (modals, drag-and-drop,
  framework re-parenting) threw `NotSupportedError`. The shadow root is now
  created once, reused on reconnect and re-populated with a fresh `<style>` and
  editor instance; `disconnectedCallback()` only unmounts the Vue element.
  Covered by a connect → disconnect → reconnect unit test and a Chromium check.
  _([#369](https://github.com/Kedata-Indonesia/docflow/issues/369))_

- **CSL styles keep their own identity (issue #360):** `parseCslStyle` used to
  file an imported style under the last segment of its `<info><id>` URI, so two
  unrelated files sharing that segment (`…/styles/harvard-cite-them-right` from
  two hosts) collapsed into one registry key and the second silently replaced
  the first. A file whose URI happened to end in `apa` also took the bundled
  APA's slot, leaving that document unable to select the built-in style again.
  The id is now the canonical CSL URI — unique by spec, stable across sessions,
  and idempotent when re-importing the same file. Bundled styles keep their
  short keys, and hosts that deliberately override one through
  `citation.styles` still can.
  _([#360](https://github.com/Kedata-Indonesia/docflow/issues/360))_

- **Header/footer hit areas (issue #320):** clicking the page margin now opens the inline
  header or footer editor for the page that was clicked, on a single click, for both sides.
  The generated widgets only cover their text box — the first-page header is absolutely
  positioned on its text and the footer ends before the bottom margin — and the old handler
  additionally bailed out on every click inside the editable surface, so the margin bands
  opened nothing at all. The hit area is now derived from the widget rect plus the page
  margin (`+/-8 px`), the clicked page's widget is passed to the editor explicitly instead of
  falling back to the first one in the document, and body clicks are ignored by selector
  before any geometry runs. Guarded by
  `e2e/showcase/issue-320-header-footer-zones.spec.ts`, which measures the rects at runtime
  instead of hardcoding offsets.
  _([#320](https://github.com/Kedata-Indonesia/docflow/issues/320))_

- **Header/footer margin follow-ups (issue #354):** the click band now spans the whole page
  margin (the first-page header is narrower than the page, so the left/right margin used to
  stay dead), and it ignores all document content — including block images and custom nodes,
  which the old text-tag whitelist missed. The showcase e2e now covers a two-page document
  (clicking page 2 opens page 2's editor), a last-block image sitting in the footer band, and
  a 150 % zoom case; its footer body check uses the last block instead of the first paragraph.
  _([#354](https://github.com/Kedata-Indonesia/docflow/issues/354))_

- **Packaging:** statically imported runtime packages are no longer declared as
  *optional* peers. `y-webrtc`/`y-websocket` (core) and the TipTap extensions
  behind `defaultPlugins` (plugins) are regular dependencies now, and the
  optional-peer flags were removed. A host no longer has to install them by
  hand: before, Vite/Rollup resolved the missing optional peers to
  `__vite-optional-peer-dep:` stubs and the host build failed with
  `"Collaboration" is not exported …`, while `pnpm peers check` stayed clean.
  The stale v2 peer entries (`extension-table-cell`/`-header`/`-row`,
  `-task-item`/`-task-list`, `-placeholder`, `-strike`) were dropped too — v3
  re-exports them from packages that already ship. A new `package-peers` guard
  fails `pnpm test:scripts` if an optional peer is ever statically imported again.
  _([#229](https://github.com/Kedata-Indonesia/docflow/issues/229))_

- **Pagination:** a pasted document with two tables taller than a page no longer
  inflates the page count or leaves a blank band above the 2nd table. The 2nd
  table inherited the leftover of the 1st table's chunk chain as its budget
  (measured: 282 px left, first row 403 px), which made the splitter leave it
  whole — a 2.5-page table in one node — and PaginationPlus then inserted empty
  pages trying to fit it (7 breaks + ~5.100 px of blank pages for ~6 pages of
  content). A table that cannot fit even one row in the space left on the
  current page now starts on the next page and chunks normally.
  _([#163](https://github.com/Kedata-Indonesia/docflow/issues/163))_

### Changed

- **Locale tables split by namespace (no consumer change):**
  `locales/en.ts` and `locales/id.ts` dropped from 636 lines each to ~30-line
  composers. Every UI namespace now lives in `locales/<lang>/<namespace>.ts`
  (`common`, `header`, `editor`, `sidebars`, `dashboard`, …), the largest being
  180 lines. Import paths (`locales/en.js`, `messages`, `getLocaleMessages`) are
  unchanged, and a new `__tests__/locales.test.ts` fails when a key exists in
  only one language or ships an empty string.

- **AI sidebar split into modules (no consumer change):**
  `AISidebar.vue` dropped from 635 lines to a ~240-line composition root. The
  transport plumbing lives in `sidebars/ai/{useAIConversation,streamTurn}.ts`,
  marker→citation insertion in `ai/insertTurn.ts`, selection awareness in
  `ai/useAISelection.ts`, and the panes in
  `ai/{AIQuickActions,AITurnBubble,AIPromptForm}.vue`. Props (`editor`,
  `aiStream`, `aiDraft`), the `close` emit and every rendered selector are
  unchanged — including the single-transaction insert invariant.

- **Offline mirror split into modules (no consumer change):**
  `packages/core/src/offlineMirror.ts` kept only the attach lifecycle and now
  re-exports the rest from `offlineMirrorKey.ts` (database naming),
  `offlineMirrorWarnings.ts` (typed warnings + console fallback),
  `offlineMirrorQuota.ts` (pre-flight estimate + rejection watcher),
  `offlineMirrorPurge.ts` (host-initiated delete) and `offlineMirrorErrors.ts`.
  `./offlineMirror.js` remains the single import site, so every public type and
  function is unchanged.

- **Reference sidebar split into panels (no consumer change):**
  `ReferencesSidebar.vue` dropped from 835 lines to a ~280-line composition
  root. The style picker, source row, create/edit form and import footer are now
  `sidebars/references/{ReferenceStylePicker,ReferenceListItem,ReferenceForm,
  ReferenceImportPanel}.vue`, with the CSL-JSON ↔ form mapping and search helper
  in `sidebars/references/format.ts`. Props, emits, `data-testid` hooks and the
  rendered DOM are unchanged.

- **Collaboration wiring split into modules (no consumer change):**
  `packages/core/src/Collaboration.ts` dropped from ~300 lines to an
  orchestrator. Types moved to `collaborationTypes.ts`, the TipTap extensions
  to `collaborationCursor.ts`, the `emitCursor` gate to
  `collaborationCursorGate.ts`, and transport + first-sync gating stay in
  `collaborationProviders.ts`. Everything remains re-exported from
  `Collaboration.ts`, so imports and the package entry point are unchanged.

- **AI plugin split into modules (no consumer change):**
  `packages/plugins/src/ai.ts` dropped from 533 lines to a ~50-line manifest.
  `ai/extension.ts` keeps `AIExtension` (storage, the five commands, the
  `@tiptap/core` command augmentation, lifecycle), `ai/plugin.ts` builds the
  ProseMirror plugin (decorations + accept/reject keys), `ai/pluginState.ts` owns
  `aiPluginKey` and the preview reducer, `ai/widgets.ts` the /ai prompt and ghost
  widgets, `ai/stream.ts` the transport port and stream loop, `ai/types.ts` the
  state types. `./ai.js` still exports `aiPlugin`, `AIExtension`, `getAIPreview`,
  `aiPluginKey` and `AIPreviewState`, so nothing changes for consumers.

- **Equation plugin split into modules (no consumer change):**
  `packages/plugins/src/equation.ts` dropped from 597 lines to a ~80-line
  manifest. The inline and display node views now live in
  `equation/{inlineNode,displayNode}.ts`, KaTeX rendering in
  `equation/render.ts`, shared document mutations in `equation/transactions.ts`
  and the numbering storage/plugin in `equation/state.ts`. All public exports
  (`equationPlugin`, `EquationState`, both node extensions, `renderEquation`,
  `EquationStorage`) are unchanged.

- **Header bar split into modules (no consumer change):**
  `HeaderBar.vue` dropped from 669 lines to a ~260-line composition root that
  only keeps props, emits, the menu tree and the action dispatcher. The title
  row (rename, star, mode badge) is `header/HeaderTitle.vue`, the menu bar
  `header/HeaderMenuBar.vue` with one dropdown per open menu in
  `header/HeaderMenuPanel.vue` (which now owns sub-menu hover state, so it
  resets when the menu remounts), the avatar stack
  `header/CollaboratorStack.vue`, and the account/overflow menus
  `header/HeaderUserMenu.vue` and `header/HeaderMoreMenu.vue`. Each dropdown owns
  its own open state and outside-click/Escape handling instead of one shared
  `closeMenus` in the parent; `header/unimplemented.ts` holds the host-owned
  classification from #153 and `header/initials.ts` the avatar initials. Props,
  emits, slots (`actions`, `user-menu`, `overflow-actions`), `data-testid` hooks
  and the rendered DOM are unchanged.

- **Inline header/footer editor split into modules (no consumer change):**
  `composables/useHeaderEdit.ts` dropped from 475 lines to a ~220-line
  orchestrator that still owns the session lifecycle. The overlay markup and
  its Options bar/controls are `headerEditBar.ts`, contenteditable block →
  `<br>` normalization (>1 line would collapse, #319) is `headerEditHtml.ts`,
  slot resolution plus page numbering is `headerEditTarget.ts`, the
  first/even/default value mapping is `headerEditValues.ts`, and listener/overlay
  teardown is `headerEditSession.ts`. Sanitization order (#51) and `SlotSide`,
  `UseHeaderEditOptions` exports are unchanged.

- **Suggest-changes plugin split into modules (no consumer change):**
  `packages/plugins/src/suggestChanges.ts` dropped from 531 lines to a
  ~180-line extension manifest (storage, plugin wiring, commands, plugin
  definition). The mark names, state and plugin key live in
  `suggest/suggestTypes.ts`, the three marks in `suggest/suggestMarks.ts`, run
  ids and range scanning in `suggest/suggestRuns.ts`, P1 user-input capture
  (typing/paste/backspace) in `suggest/suggestCapture.ts`, P3 bold/italic →
  format proposals in `suggest/suggestFormatChanges.ts`, `getSuggestions` in
  `suggest/suggestQueries.ts` and accept/reject in `suggest/suggestResolve.ts`.
  Every public export (`SUGGESTION_*`, the marks, `suggestChangesKey`,
  `getSuggestions`, the accept/reject helpers, `setDocumentMode`,
  `setSuggestionAuthor`, `suggestChangesPlugin`) still resolves through
  `./suggestChanges.js`.

- **Smart elements split one file per chip (no consumer change):**
  `packages/plugins/src/smartElements.ts` dropped from 519 lines to a ~50-line
  plugin manifest. Each chip now has its own module in `chips/`
  (`dateChip`, `peopleChip`, `fileChip`, `dropdownChip`, `locationChip`),
  shared attribute helpers and the node-view shell live in
  `chips/chipShared.ts`, and the `insert*Chip` commands plus the slash entries
  in `chips/chipCommands.ts`. Node names, attributes, rendered DOM/classes and
  the `smartElementsPlugin` export are unchanged; the five nodes are still
  re-exported from `./smartElements.js`.

- **Table page-split plugin split into modules (no consumer change):**
  `packages/plugins/src/tablePageSplit.ts` dropped from 510 lines to a
  ~100-line plugin manifest (deferred-pass wiring, `PLUGIN_KEY` meta skip,
  `pendingRun` coalescing, `tablePageSplitPlugin`). Measurement moved to
  `tableSplit/tableSplitMeasure.ts`, split-row/head-budget/cursor helpers to
  `tableSplit/tableSplitRows.ts`, the recursive chunk builder to
  `tableSplit/tableSplitChain.ts` (row-count invariant still throws), the
  deferred pass to `tableSplit/tableSplitPass.ts`, and shared constants/types
  to `tableSplit/tableSplitTypes.ts`. Behaviour is unchanged: same
  `tablePageSplit` `head` attr, same `PAGE_COUNT_META_KEY` skip, same
  `addToHistory: false` split transaction.

- **Docs editor split into chrome + page surface (no consumer change):**
  `components/DocsEditor.vue` dropped from 462 lines to a composition root that
  only keeps the composable wiring. The chrome above the page (header bar,
  toolbar, floating exit-focus button, with the
  `header-actions`/`overflow-actions`/`user-menu` slots forwarded) is now
  `docsEditor/DocsEditorTopBar.vue`; the scroll container, zoom wrapper,
  virtual-page overlay, loading overlay and ProseMirror mount point are
  `docsEditor/DocsEditorPaper.vue` (the `.docs-editor__paper` styles moved with
  it). The surface receives its element refs as a plain bundle
  (`docsEditor/docsEditorPaperTypes.ts`) because Vue unwraps refs passed straight
  from a template, which would hand the child `null`. Locale provide/watch moved
  to `useDocsEditorLocale.ts` and document-mode state to `useDocsEditorMode.ts`,
  with the suggestChanges mode/author sync in `useDocsEditorSuggestSync` (created
  after the session, so a watch source can never read an uninitialized ref).
  Selectors (`.docs-editor-scroll`, `.docs-editor__paper`,
  `data-testid="docs-editor-zoom"`), zoom/ruler behaviour and every binding the
  tests reach through `wrapper.vm` are unchanged.

- **Manual column resize split into modules (no consumer change):**
  `packages/core/src/ManualColumnResize.ts` dropped from 405 lines to an ~85-line
  extension manifest that only creates the plugin, wires the capture-phase
  listeners and tears them down. Pointer hit-testing (colspan-aware logical
  columns, #55) and the drag snapshot live in
  `manualColumnResize/columnGeometry.ts`, width measurement in
  `columnMeasure.ts`, the DOM writer + `domObserver` gate in `columnDom.ts`, the
  drag loop (redistributive vs last-column clamp, #116) in `dragSession.ts`, the
  colwidth transaction in `persistColwidths.ts`, the `docflow-active-border-line`
  hint in `resizeLine.ts`/`hoverIndicator.ts` and the table position lookup in
  `tablePosition.ts`. The export path and the "register before the table plugin"
  ordering are unchanged. New `__tests__/manualColumnResize.test.ts` (11 tests)
  pins merged-cell hit-testing, width measurement/fallback, the last-column
  clamp and the DOM writer; the mousedown listener is now also removed on
  `destroy` instead of leaking with the view.

- **Citation engine + plugin split into modules (no consumer change):**
  `packages/plugins/src/citeEngine.ts` (375 → 174) stays the public
  `CiteEngine` facade and now owns only state bookkeeping and listeners, with
  the rendering replay in `cite/citeRender.ts` (`renderCitations`,
  `buildClusterSignature`), style validation + citeproc construction in
  `cite/citeStyles.ts`, the style registry (`register`/`remove`/`setActive`,
  bundled-style protection, active-style fallback) in
  `cite/citeStyleRegistry.ts`, the tag allow-list in `cite/citeHtml.ts`, the
  cluster id counter in `cite/citeClusterId.ts` and the shared attribute types
  in `cite/citeTypes.ts`. `citation.ts` (365 → 53) is now a manifest: the
  per-editor engine plus the document↔engine sync (duplicate-id repair,
  ordered recompute, footnote `content` persistence) live in
  `citation/citationStorage.ts`, the inline node view in
  `citation/citationNode.ts` and the insert/style commands in
  `citation/citationCommands.ts`. Every previous export
  (`citeEngine.js`: `CiteEngine`, `resolveCslStyles`, `sanitizeCiteprocHtml`,
  `nextCitationId`, `CslStyleInfo`, `CitationAttrs`, `CitationCluster`,
  `CitationMode`, `CiteEngineOptions`; `citation.js`: `citationPlugin`,
  `CitationNode`, `CitationEngineExtension`, `getCitationEngine`,
  `buildCitationNodes`, `CitationStorage`) still resolves from the same path,
  and the validation error strings (including which style id failed) are
  unchanged. New `__tests__/citeRender.test.ts` pins the memoization signature
  and the cited-only/uncited bibliography split.

- **`PageLayout` split into modules (no consumer change):**
  `packages/layout-engine/src/PageLayout.ts` (368 → 183) keeps the class and
  its public surface (`EditorLike`, `measureBlocks`, `layout`, `observe`,
  `destroy`, default 150 ms debounce) but now only orchestrates a run. DOM →
  block conversion (position fallbacks, `canSplit`, keep-together, CSS margins)
  lives in `layout/layoutBlockMeasure.ts`, the cache fingerprints in
  `layout/layoutFingerprint.ts`, the off-screen clone in `layout/layoutShadow.ts`,
  the Range-based split measurement in `layout/layoutTextOffset.ts` and the
  head-page reuse rule in `layout/incrementalPages.ts`. Behaviour is unchanged:
  fast path on an unchanged document/size, one shadow refresh per fingerprint,
  and page objects are still reused by reference when only the tail changed, so
  downstream redraws stay minimal. New `__tests__/layoutInternals.test.ts`
  (8 tests) pins the fingerprint keys and the merge rule (tail change reuse,
  resize invalidation, moved boundary, appended block, first run).

- **`VirtualPageOverlay` split into config and window modules (no consumer
  change):** `packages/layout-engine/src/VirtualPageOverlay.ts` (232 → 199)
  keeps the class and its public surface (`layout`, `observe`, `disconnect`,
  `getData`, `updateConfig`, `onVisibleChange`, default 2-page buffer) but now
  only owns the lifecycle. Config defaults and resolution moved to
  `pageOverlayConfig.ts` (`PageOverlayConfig`, `VisiblePage`, `PageOverlayData`,
  `ResolvedOverlayConfig`, `resolvePageSize`, `resolveOverlayConfig`,
  `samePageSize`, `sameMargins`), and the visible-window math to
  `visibleWindow.ts` (`computeVisiblePages`, `sameVisiblePages`, now pure and
  DOM-free). Both modules are re-exported from `./VirtualPageOverlay`, so
  `dist/index.d.ts` keeps every export name consumers already import.

- **`toc` plugin split into modules (no consumer change):**
  `packages/plugins/src/toc.ts` (348 → 152) still holds the node and extension
  definitions, the command declaration and the plugin manifest, and exports the
  same names (`tocPlugin`, `TocNode`, `TocEntryNode`, `TocPageNumNode`,
  `collectHeadings`, `regenerateToc`). Heading collection and the layout-derived
  page-number resolver moved to `toc/headingCollect.ts`, entry generation and
  the single-transaction refresh to `toc/tocContent.ts`, and the NodeView chrome
  (caption, refresh button, click-to-jump) to `toc/tocNodeView.ts`. Rendered
  markup, `data-toc*` selectors and the H1–H3-only rule are unchanged.

- **`useCitations` split into modules (no consumer change):**
  `packages/vue/src/composables/useCitations.ts` (341 → 200) stays the
  composition root — picker state, library CRUD, style switching and the
  `CitationPort` handed to the editor — and still exports the same names
  (`useCitations`, `BUNDLED_REFERENCE_STYLES`, `CitationsEmit`,
  `CitationStyleOption`, `UseCitationsOptions`). The contract types and the
  bundled-style list moved to `citationTypes.ts`, DOI/bibliography import into
  `citationImporters.ts`, and the `.csl` import path into
  `citationStyleImport.ts`. Emitted events, the picker fallback and the
  `console.error` on a malformed style are unchanged.

- **`useFootnotes` split into DOM, layout and jump helpers (no consumer
  change):** `packages/vue/src/composables/useFootnotes.ts` (329 → 214) keeps
  the watchers, the debounce/retry timers and the per-page numbering loop, and
  still exports `useFootnotes`, `updateFootnotes` and `scheduleFootnotes`. The
  footnote markup (editable body vs citeproc body, container, numbered row)
  moved to `footnoteDom.ts`, the break-area measurement and page grouping to
  `footnoteLayout.ts`, and the `<sup>` click-to-jump to `footnoteJump.ts`. The
  pagination retry (#19), the continuous numbering and the `#71` sanitize
  fallback behave exactly as before.

- **`useEditCommands` split into actions, clipboard and keyboard (no consumer
  change):** `packages/vue/src/composables/useEditCommands.ts` (335 → 139) keeps
  the command map and the `runMenuEditorCommand` / `runPluginMenuAction` /
  `insertPageNumber` helpers, and still exports `useEditCommands` plus
  `EDIT_FORMAT_MENU_ACTIONS` (now defined in `editFormatActions.ts`, so the
  `menuActions.drift` parity test keeps guarding the same list). Selection
  serialization, cut/copy/paste/paste-plain and the Delete-selection rule moved
  to `editClipboard.ts`; the document-level `keydown`/`paste` listeners (⌘⇧V,
  ⌘⇧H, Escape-to-leave-focus-mode, image-only paste capture) moved to
  `editKeyboard.ts` with the same mount/unmount pairing. Menu classification,
  emitted events and the `console.error` fallbacks are unchanged.

- **`Indent` extension split into level and dispatch modules (no consumer
  change):** `packages/core/src/Indent.ts` (341 → 118) keeps the command
  declaration and both extensions (`IndentExtension` at priority 50,
  `IndentBackspaceExtension` at 150) and re-exports the same public names
  (`clampIndentLevel`, `indentLevelOf`, `INDENT_STEP_PX`, `INDENT_MAX_LEVEL`,
  `INDENT_STYLE_VAR`, `INDENT_STEP_VAR`). The attribute contract — constants,
  `parseIndentLevel` (with the `margin-left` fallback), `renderIndentAttributes`
  — moved to `indent/indentLevel.ts`, and the Tab/Shift-Tab resolution order
  (code block whitespace → list nesting → block indent), the block shifts and
  the Backspace-at-block-start outdent to `indent/indentBlocks.ts`. Clamping,
  the `data-indent` round-trip and the priority ordering are unchanged.

- **`createEditor` split into types, content migration and editor factory (no
  consumer change):** `packages/core/src/Editor.ts` (365 → 106) is now a facade:
  it still exports `createEditor`, `migrateContent`, `EditorOptions`,
  `DocsEditor` and the paste-normalization helpers, and keeps the
  `createEditor` lifecycle (collab ownership, plugin `onInit`/`onDestroy`,
  `use()` rebuild with selection restore, debug monitor). The option/result
  interfaces moved to `editor/editorTypes.ts`, the legacy `bibliography` →
  `referenceList` / `page` unwrapping to `editor/migrateContent.ts`, and the
  TipTap instance factory (StarterKit opt-outs, `InlineCode` without input
  rules, extension order, collab extensions, `transformPastedHTML`) to
  `editor/createTiptapEditor.ts`. No new name is re-exported from the package.

- **Debounced `update:modelValue` (issue #374):** typing now coalesces into a
  single trailing emit (~300 ms) instead of emitting a rebuilt tabbed document
  on every keystroke. A pending edit is flushed when the editor loses focus or
  the component unmounts, and a host write cancels it so a stale snapshot can
  never land after the host replaced the document. Discrete changes
  (header/footer edits, commands) still emit immediately.
  _([#374](https://github.com/Kedata-Indonesia/docflow/issues/374))_

- **Tailwind CSS 3 → 4 (issue #215):** `packages/vue`, `packages/element` and
  `examples/playground` compile their stylesheet with `tailwindcss@4` and
  `@tailwindcss/postcss`; the three `tailwind.config.js` files are gone and their tokens
  live in the CSS entry (`@theme` for font/shadow tokens, `@custom-variant dark` for the
  class-based dark mode, `@source` for the component globs). Consumers get a stylesheet
  whose utilities are **inside `@layer`** — that matters: an app on Tailwind 4 saw the
  library's unlayered v3 utilities win over its own layered ones (`.hidden` beating
  `lg:table-cell`, collapsing dashboard columns) until it moved to this release. Measured
  against the v3 baseline: 0.036–0.040 % of pixels differ, all antialiasing edges from
  Tailwind 4 emitting OKLCH colours (dominant-colour pixel counts are identical; shifting
  the image ±1 px makes the diff worse, so no layout moved).
  _([#215](https://github.com/Kedata-Indonesia/docflow/issues/215))_

- **Packaging:** `@kedataindo/docflow-vue` no longer bundles its runtime
  dependencies. `dist/index.js` drops from ~2.17 MB to ~420 kB and the npm
  tarball from 4.28 MB to ~0.29 MB; the CSL styles, TipTap/ProseMirror and the
  lucide icon set are now imported from the consumer's `node_modules` instead of
  being inlined. `@tiptap/core` and `prosemirror-model` are peer dependencies so
  a host app keeps a single ProseMirror instance — install them if your package
  manager does not auto-install peers.
  _([#168](https://github.com/Kedata-Indonesia/docflow/issues/168))_

### Changed

- **Editor engine: TipTap 2 → 3** (issue #166). Every `@tiptap/*` dependency and peer floor
  moves to `^3.32.0`, and `tiptap-markdown` to `0.9.0` (its only v3-compatible release).
  Hosts must raise the same floors: v3 reshapes the table/list packages, so a host pinning
  `^2` cannot share the schema. Documents themselves stay compatible — no node type or mark
  was added or removed, `table`/`tableCell`/`tableRow` keep `tablePageSplit`, `colspan`,
  `rowspan` and `colwidth`, and the pagination storage contract is unchanged. Documents
  written under v3 additionally carry the attributes v3 defines (`align` on cells,
  `width`/`height` on images).
- **Tables:** the v3 `TableView` node view is disabled (`Table.configure({ View: null })`).
  It rebuilds the `<table>` element itself and drops what our `renderHTML` puts on it —
  `data-tps-splittable` (the signal the patched PaginationPlus reads) and `data-colwidth` —
  and rewrites the inline width without `!important`, which pushed tables past the page
  margin. Column resizing belongs to `ManualColumnResize`, so the node view bought nothing.
- **Citations:** the duplicate-`citationId` repair no longer relies on its own dispatch
  re-running `onUpdate`. TipTap v3 coalesces transactions dispatched from a lifecycle hook,
  so the repair now falls through to the same-pass recompute — copy-pasted citations keep
  rendering their own cluster instead of one empty one.
- **StarterKit:** v3's bundled `Link`/`Underline` duplicates are disabled in favour of the
  plugin instances (which configure `openOnClick` and the underline mark), and `trailingNode`
  stays off — it appends an empty paragraph after an isolating block, which would mutate
  documents that merely end with a table.

### Removed

- **`@tiptap/extension-collaboration-cursor`** is replaced by a `collaborationCursor`
  extension inside `@kedataindo/docflow-core`, built on `@tiptap/y-tiptap` (the fork v3
  uses). The package has no v3 release: its `3.0.0` is a mis-tagged 2.5.0 that still
  registers `y-prosemirror`'s cursor plugin, whose `init` runs before the fork's `y-sync$`
  state exists and throws `Cannot read properties of undefined (reading 'doc')` on mount, so
  a collaboration host could not open the editor at all. The awareness contract
  (`user` / `cursor` fields) is unchanged.

## [2026-10-08]

### Added

- Demo GIF above the fold in the README — typing → auto page break →
  header/footer page numbers → collaborator presence → the export menu — with a
  reproducible recorder (`scripts/record-demo.mjs`).
  _([#17](https://github.com/Kedata-Indonesia/docflow/issues/17))_
- `pnpm playground:restore` (`scripts/restore-playground.mjs`) — one command to
  recover the local-only playground in a fresh clone.
- `docs/COMMUNITY.md` (channels + code of conduct) and `docs/operations/RELEASING.md`
  (changelog discipline + GitHub Releases), plus `.github/release.yml` to group
  generated release notes by label.
- Pushing a `v*` tag now cuts a GitHub Release automatically — label-grouped
  notes with the demo GIF attached (`.github/workflows/publish.yml`).
- `CHANGELOG.md` discipline: notable library changes are recorded here and
  mirrored to GitHub Releases.
- DOCX table export with darker borders and explicit widths.
- `openShareModal` on the Vue `DocsEditor` component.
- Playground app (`examples/playground`) for backend-free local UI review via
  the public API. _Kept untracked; restore with `pnpm playground:restore`
  (PR #62)._

### Changed

- README links the community doc and documents the new playground restore
  command; `CONTRIBUTING.md` and `docs/product/ARCHITECTURE.md` follow suit.
- Split the repository into a **library-only** repo (`packages/*`); the app moved
  to `docflow-app`.
- Decomposed the Vue `DocsEditor` monolith into focused composables
  (page surface, session, paging, header/footer, footnotes, citations, comments,
  bubble menu, document model) and separate dialog/sidebar children (#44).
- Made the `pageSize` and `editable` props reactive.
- Rebuilt the page layout only on real configuration changes.
- Enabled ESLint in CI (`pnpm lint`) and drove lint warnings to zero (#45).
- Aligned workspace test resolution with the public package subpaths (#40).

### Fixed

- **Security:** sanitize persisted footnote content before `innerHTML` (#71).
- **Security:** sanitize inline HTML in header and footer slots (#51).
- Corrected pagination docs to describe the single derived page model and added a
  guard for it (#43).
- Multi-table page-split cursor tracking (#198).
- Removed the 300px `tbody` cap so split-table chunks render at full height.
- Table split: dropped separator paragraphs (#193), measured against the
  post-DOM-update view, and produced all chunks in one transaction (#192).
- Capped page count by total editor content height (#191).
- Prevented freezes and page jumps when pasting/splitting tall tables
  (#191, #193, #198).

### CI / Release

- Publish to **public npm only** (`registry.npmjs.org`, `@kedataindo` scope);
  dropped GitHub Packages and its PAT requirement.
- Push to `main` now verifies, auto-bumps, builds, publishes, and verifies the
  new versions are live on npm (registry-aware bump; idempotent publish).
- Landed release bumps back on `main` via an automated pull request so the repo
  never drifts behind npm (ruleset-compatible).
- Bounded each registry read in the release verification and waited out npm
  replica lag.

## [2026-10-06] — Public npm launch

### Added

- Per-package READMEs for the npmjs package pages.
- `CONTRIBUTING.md` with dev setup, verification steps, and PR expectations.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) and GitHub issue/PR templates.
- README badges for npm version, downloads, license, and CI.

### Changed

- **Relicensed to Apache-2.0** and rewrote the README for the open-source launch.
- Published packages publicly on npm under `@kedataindo` — installable with no
  auth and no `.npmrc`.
- Distinguished the library repo from the host app in docs.

### Fixed

- Corrected npm install instructions to use the published `@kedataindo` scope.

## Earlier development (pre-launch)

The foundation the launch builds on, accumulated before the repo split.

### Added

- Rich-text editing on TipTap/ProseMirror: headings, lists, tables, images,
  links, code blocks, blockquote, text alignment, and undo/redo.
- Page layout engine: A4/Letter/Legal page containers, automatic page breaks,
  manual page breaks, page counter, margins, and paper shadow.
- Header/footer with automatic page numbers (`{page}` / `{total}`).
- Real-time collaboration on Yjs: multi-user cursors, presence/awareness avatars,
  and server-authoritative persistence.
- Offline editing via `y-indexeddb` with a `whenReady` sync gate.
- Plugin system (`definePlugin`) and built-in plugin bundle (`defaultPlugins`).
- Framework bindings: Vue 3 components/composables and a framework-agnostic
  `<docs-editor>` Web Component.
- Export engine (`@kedataindo/docflow-export`): DOCX / ODT / RTF / Markdown.
- Citations & references: DOI/CrossRef and BibTeX/RIS importers, plus cited PDF
  and DOCX export.
- AI integration: pluggable provider transport ports (`aiStream` / `aiDraft`),
  streamed markdown-to-nodes insertion, and provider-agnostic compatibility.
- Built-in English/Indonesian i18n.
- Editor menus (File/Edit/Format/Insert/View) with Lucide icons, slash command
  menu, Google Docs-style color picker, font size control, and a pageless-mode
  toggle.

### Fixed

- Table column resize made redistributive and colspan-aware.
- Font size now uses a dedicated mark (fixes +/- buttons and default size).
- Footnote numbering stays continuous across pages.
- Bubble menu anchors to the selection head.
- Comments surface an error instead of silently dropping a thread.
- Presence heartbeat and provider retry pause while the tab is hidden (#188).
- Eliminated duplicate Yjs instantiation and peer-avatar flicker in collaboration
  (#115), and gated rendering on server sync to avoid a stale IndexedDB cache
  painting first (#117).
- DOM-based paste normalization for Google Docs compatibility.

[Unreleased]: https://github.com/Kedata-Indonesia/docflow/compare/v2026.10.27.1...HEAD
[2026-10-08]: https://github.com/Kedata-Indonesia/docflow/releases/tag/v0.0.90
