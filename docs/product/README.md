# Product — what DocFlow is meant to be

These documents describe the product **baseline**: the scope, the intended architecture, and
the roadmap that the library packages were built against. They are kept for context and
decision history, not as runbooks.

| Document | What it answers | Status |
|---|---|---|
| [PRD.md](./PRD.md) | What the editor must do, for whom, and the feature scope | Baseline (v1.0) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How data flows across the browser, the packages, the host app, and its stores | Cross-repo map — includes the host app |
| [ENHANCEMENT_ROADMAP.md](./ENHANCEMENT_ROADMAP.md) | The phased plan the library grew out of, with links to each phase plan | Historical |

## How to read them today

- **This repo is library-only.** Anything that names `apps/web`, `apps/server`, MongoDB, or
  Docker belongs to [`docflow-app`](https://github.com/Kedata-Indonesia/docflow-app).
- **For current behaviour**, use [../reference/LIBRARY_CONTRACT.md](../reference/LIBRARY_CONTRACT.md)
  and the guides in [../guides/](../guides/). When a baseline doc disagrees with the
  contract, the contract wins.
- **Do not rewrite these to match today's code.** If something important diverged, add a
  dated note at the top of the affected document and describe the change in
  [../../CHANGELOG.md](../../CHANGELOG.md).
