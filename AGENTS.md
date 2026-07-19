# Agent Workflow — DocsEditor

This project uses **vibe code** with an orchestrator + specialist agent pattern to keep the rich-text/page-layout/collaboration stack stable.

## Agents

| Agent | Role | Trigger |
|-------|------|---------|
| `orchestrator` | Primary. Plans, delegates, verifies. | Default for every request. |
| `page-layout-engineer` | ProseMirror DOM, pagination, derived `Page[]` model, `ResizeObserver`, debounce, shadow layout. | Any change to `packages/layout-engine/` or page rendering. |
| `collab-engineer` | Yjs CRDT, `y-websocket`, awareness, multi-user cursor, sync conflicts. | Any change to `packages/core/Collaboration.ts`, Yjs providers, or room logic. |
| `tiptap-extender` | TipTap extensions, ProseMirror schema, commands, bubble menu, slash commands. | Any new node/mark/extension, toolbar command, or schema change. |
| `bug-hunter` | Review, edge-case analysis, test verification, PRD alignment. | After any non-trivial change, before marking a task done. |

## Orchestrator Rules

1. **Read context first.** Always start with `docs/PRD.md` and relevant source files before delegating.
2. **Use `todowrite`.** Break every feature into small, verifiable tasks and keep status updated.
3. **Delegate by domain.** Use the `task` tool with the right subagent. Never ask a general agent to do a specialist job.
4. **Verify after every edit.** Run the relevant verification commands (lint, typecheck, unit tests, build). If you cannot find the command, ask the user.
5. **Bug-hunter gate.** Before completing a task, delegate `bug-hunter` to review the diff and tests.
6. **Single source of truth.** ProseMirror state is the only editable model; layout and collaboration are derived views.
7. **No silent regressions.** If a change touches core/editor/layout/collab, run all three package checks when possible.
8. **Respect the library boundary.** No backend imports in `packages/*`; persistence/auth/storage/AI are the host app's job, reached only via the injection ports in `docs/LIBRARY_CONTRACT.md`.

## Specialist Prompts

See `.opencode/agents/*.md` for each specialist's detailed system prompt.

## Verification Checklist

- [ ] Lint passes (`pnpm lint` / `eslint` / project-specific).
- [ ] TypeScript typecheck passes (`pnpm typecheck` / `tsc --noEmit`).
- [ ] Unit tests pass (`pnpm test:unit` / `vitest`).
- [ ] Relevant E2E tests pass (`pnpm test:e2e` / `playwright`) if UI changed.
- [ ] Build passes (`pnpm build`) for affected packages.
- [ ] No new backend imports in `packages/*` (library contract holds — see `docs/LIBRARY_CONTRACT.md`).
