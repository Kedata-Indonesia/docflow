# @kedataindo/docflow-layout-engine

Page split / pagination engine for [DocFlow](https://github.com/Kedata-Indonesia/docflow) — the piece that gives the editor true A4/Letter/Legal page layout: automatic page breaks, headers/footers with `{page}`/`{total}`, and print-accurate rendering.

> **Internal package.** You normally don't install this directly — it's wired in by `@kedataindo/docflow-vue` / `@kedataindo/docflow-element`. Published for completeness.

## What it does

- `PageLayout` — measures block DOM via `ResizeObserver` (debounced, shadow-DOM pass)
- `PageBreaker` — computes page splits for A4/Letter/Legal/custom sizes
- `VirtualPageOverlay` — page chrome (margins, headers, footers) rendering

Framework-agnostic, ProseMirror-state-driven: layout is a derived view, never a second model.

## Documentation

[github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
