# DocFlow Playground

Backend-free, runnable example of `<DocsEditor>` driven **only through the public
API** — the same surface a consumer uses. It is the fastest way to review UI
changes without the host app (auth, Mongo, REST, deployment).

```
examples/playground/
├── src/App.vue         # mounts <DocsEditor>, wires every public prop + event
├── src/ReviewPanel.vue # live controls for the public props
├── src/EventLog.vue    # shows which events the editor emits
├── src/sampleData.ts   # sample documents, comments, versions, collaborators
└── vite.config.ts      # dist mode (default) + source mode (HMR over packages/*)
```

## Run it

From the repository root:

```bash
pnpm install
pnpm build          # builds the library packages + this example (dist mode needs dist/)
pnpm dev            # http://localhost:5200
```

`pnpm dev` uses the **built** library (`packages/*/dist`), which is what a real
consumer downloads. Editing the playground gives fast HMR.

## Source mode (HMR while editing the library)

```bash
pnpm --filter @kedata-indonesia/docflow-playground dev:source
```

`PLAYGROUND_SOURCE=1` aliases all six `@kedata-indonesia/docflow-*` packages —
plus `@kedata-indonesia/docflow-vue/style.css` — to `packages/*/src`, so edits
inside the packages hot-reload immediately and **no `pnpm build` is needed**
(not even on a fresh clone). Tailwind compiles the library's raw entry against
the library sources; see `tailwind.config.js` and `postcss.config.js`.

## What you can exercise here

| Area | Prop / event |
|------|--------------|
| Document | `modelValue`, `update:modelValue`, sample docs (letter / contract / report) |
| Layout | `pageSize`, `orientation`, `pageless`, `virtualPages`, `margins`, `update:margins` |
| Chrome | `title`, `userName`, `locale`, `editable`, `debug`, `connectionState`, `collaborators` |
| Comments | `comments`, `update:modelValue` anchors, `add-comment`, `add-reply`, `resolve-comment`, `delete-comment` |
| Versions | `snapshots`, `save-snapshot`, `restore-snapshot`, `preview-snapshot` |
| Menu | `menu-click`, `export`, `share`, `back`, `toggle-star`, `ready` |

Anything **not** wired here is deliberate: persistence, auth, storage and AI are
host responsibilities reached through the injection ports described in
[`docs/LIBRARY_CONTRACT.md`](../../docs/LIBRARY_CONTRACT.md). This example keeps
the fixtures in memory so the repository stays backend-free.

## Notes for contributors

- The playground depends on the workspaces (`workspace:*`), so it never needs a
  published package. Publishing is a separate, tag-gated concern
  (`.github/workflows/publish.yml`).
- Keep the playground free of host-app code: no fetch, no auth, no Mongo. If you
  need a new capability to demo a change, add an injection port instead.
- The **Blank document** preset and the `window.__docsEditor` test hook (set in
  `App.vue`'s `@ready` handler) exist for the showcase e2e specs in `e2e/showcase/`.
  The specs insert content through `editor.commands`, so keep the hook wired.
