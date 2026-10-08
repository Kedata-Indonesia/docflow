# Playground preview

`preview.png` — `examples/playground` running in the default dist mode
(`pnpm build && pnpm dev`), viewport 1440x900, captured 2026-10-07.

> **Status:** the playground app is no longer tracked (PR #62, `.gitignore`). This
> screenshot documents the revision reviewed in PR #60; restore it locally with
> `pnpm playground:restore`.

What it shows: the letter sample (`Surat Undangan Rapat Koordinasi`) on A4 paper,
the review panel with the public props (document preset, title, page size,
orientation, pageless, editable, locale, user name, connection state), the event
log (`update:pageCount`, `ready`) and the 2-page status bar.

The panel and the log are deliberately floating overlays — the editor itself is
`h-screen w-full`, so nothing is injected into the library's layout.
