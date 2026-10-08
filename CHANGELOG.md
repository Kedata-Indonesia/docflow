# Changelog

All notable changes to the DocFlow **library packages** (`packages/*`) are
documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **How versioning works here.** This is a monorepo: each package
> (`@kedataindo/docflow-core`, `-layout-engine`, `-vue`, `-element`, `-plugins`,
> `-export`) is versioned and published independently, and CI patch-bumps every
> changed package on each push to `main`
> (see [`docs/PUBLISH.md`](./docs/PUBLISH.md)). Versions therefore do not move
> in lockstep, so entries below are grouped by **date of the change**, not by a
> single repository-wide version number.
>
> Scope: only the reusable packages are covered. The deployable application
> (web UI + API server) lives in
> [`Kedata-Indonesia/docflow-app`](https://github.com/Kedata-Indonesia/docflow-app)
> and has its own history.

## [Unreleased]

### Added

- Demo GIF above the fold in the README — typing → auto page break →
  header/footer page numbers → collaborator presence → DOCX export — with a
  reproducible recorder (`scripts/record-demo.mjs`).
  _([#17](https://github.com/Kedata-Indonesia/docflow/issues/17))_
- `pnpm playground:restore` (`scripts/restore-playground.mjs`) — one command to
  recover the local-only playground in a fresh clone.
- `docs/COMMUNITY.md` (channels + code of conduct) and `docs/RELEASING.md`
  (changelog discipline + GitHub Releases), plus `.github/release.yml` to group
  generated release notes by label.

### Changed

- README links the community doc and documents the new playground restore
  command; `CONTRIBUTING.md` and `docs/ARCHITECTURE.md` follow suit.

## [2026-10-08]

### Added

- `CHANGELOG.md` discipline: notable library changes are recorded here and
  mirrored to GitHub Releases.
- DOCX table export with darker borders and explicit widths.
- `openShareModal` on the Vue `DocsEditor` component.
- Playground app (`examples/playground`) for backend-free local UI review via
  the public API. _Kept untracked; restore with `pnpm playground:restore`
  (PR #62)._

### Changed

- Split the repository into a **library-only** repo (`packages/*`); the app moved
  to [`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).
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

[Unreleased]: https://github.com/Kedata-Indonesia/docflow/compare/main...HEAD
