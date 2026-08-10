# DocFlow — Integration Skills (Writing, Reference, Citation)

> **Audience:** AI agents writing or serving DocFlow integration content — release notes, migration guides, integration recipes, support replies, third-party docs, and cross-team explanations.
> **Status:** as of `main` @ `a25e96d` (post Phase 9 P9-4 C1+C2+C3).
> **Use together with:** `docs/ARCHITECTURE.md` (system map) + `AGENTS.md` (commands + invariants).

---

## 1. Voice, register, audience

### Default voice

- **Direct, technical, slightly informal.** Sentences are short, verbs do the work.
- **Confident about facts, explicit about uncertainty.** No marketing fluff. No exclamation marks. No "leverage", "synergy", "unlock", "delight", "seamless", "leverage" as a verb.
- **Code-first.** Show the file, the function name, the line number. Don't paraphrase code into prose.
- **Acronyms expanded on first use.** `Y.Doc`, `CRDT`, `WS`, `REST`, `SSE`, `S3`, `SSO`, `Yjs`, `TipTap`, `Better Auth`.
- **Time-specific facts use `as of <commit SHA>`.** Never "currently" or "recently" without an anchor.

### Audience

| Reader | What they need from your writing |
|--------|-----------------------------------|
| **Engineer integrating DocFlow into their own product** | "Which port does my X go through?" → see `docs/LIBRARY_CONTRACT.md` |
| **Operator deploying DocFlow self-host** | "How do I configure this env var?" → `docs/DEPLOYMENT.md` §3 |
| **Team lead planning a rollout** | "What's safe to parallelize?" → `docs/plans/sprint-9-10-execution-plan.md` |
| **Another agentic AI extending or running DocFlow** | "What can I safely touch?" → `docs/ARCHITECTURE.md` §10 + §12 |
| **End user (rare; goes through support)** | "How do I…?" → `apps/web/src/locales/` strings |

Write **one document per audience**, don't try to hit all five at once.

### Voice examples

```md
# Bad: leverage + vague
"DocFlow leverages cutting-edge AI to deliver a seamless collaborative
experience that delights users across the enterprise."

# Bad: hedge + fluffy
"It might be helpful to think about how DocFlow's robust Yjs integration
could potentially enhance collaboration."

# Good: direct + anchored
"`apps/server` runs Express 4 on `PORT` (default 3001). The Y.Doc
is the authoritative model — `Document.content` is a derived
read-model regenerated on flush (see §6.2)."
```

---

## 2. Citation & reference conventions

### Anchor every claim

Every fact that touches the codebase **cites the file and (optionally) the line or function name**. Format:

```
file_path:line_number            # line-anchored, for one-liner references
file_path:file_function           # function-anchored, for multi-line references
file_path                        # file-anchored, for whole-module references
```

Examples (from the actual repo):

- "`Document.collaborators: string[]` flat — see `apps/server/src/models/Document.ts:10,33`"
- "Yjs awareness lives at `packages/core/src/Collaboration.ts:9-83`"
- "`migrateCollaboratorsToRoles` runs at server boot — see `apps/server/src/migrations/roles.ts`"

**Do not paraphrase** what the file does without anchoring. The reader should be able to ctrl-click and see the same thing you're describing.

### Anchor every external claim

For anything outside the repo — third-party libraries, RFCs, standards, vendor docs:

```
[Display name](https://url)  # inline link, descriptive text
```

Examples:
- `[Yjs](https://github.com/yjs/yjs)` (project page)
- `[Better Auth cookie docs](https://www.better-auth.com/docs/concepts#session)` (doc anchor)
- `[MongoDB Atlas PITR](https://www.mongodb.com/docs/atlas/backup-restore-online/)` (vendor doc)

**Never cite a URL without the display name.** Bare URLs are noise.

### Cite the design intent, not just the code

For non-obvious decisions, name the design tension. Examples:

```
"Phase 9 RO3: viewer/commenter still get a WS so they can receive
state updates, but their inbound sync messages (MESSAGE_SYNC, type
byte 0) are dropped at the WS layer. Awareness messages pass
through — see `apps/server/src/index.ts` setupReadOnlyWSConnection.
The plan §6 risk row *\"RO3 WS enforcement (the crux)\"* motivated this."
```

The reader learns **why** the code is the way it is. They don't re-derive the constraint.

### When to use what

| Use | Don't use |
|-----|-----------|
| `file_path:line_number` for one-liner callout | `(line 10)` without file |
| `docs/ARCHITECTURE.md §3.4` for cross-reference | `section 3.4` |
| Inline `[link](url)` once per term | Re-linking every mention |
| File-block reference at the top of a section | Repeating the same anchor |

---

## 3. Writing standards (language-specific)

### English

- **Acronyms:** expand on first use in a document, then abbreviated. `Yjs CRDT` → `CRDT`. Never `CRDT (Conflict-free Replicated Data Type)` if you've already explained CRDT once in the doc.
- **Numbers:** spell out `one`, `two`, `three` for ≤ 10; numerals otherwise.
- **Tense:** present for code behaviour ("`onUpdate` fires when…"), past for finished events ("PR #94 was merged in `main` @ `a25e96d`").
- **Quotation:** use for file paths, env-var names, function names, type names. Don't quote for emphasis (`"very" small`) — use italics or stronger verbs.
- **Sentence case in headings.** Sentence fragments are headings; sentences are paragraphs.
- **One idea per paragraph.** Two paragraphs can disagree; one paragraph cannot.

### Bahasa Indonesia (when writing in Indonesian)

Use `docs/PRD.md` as the voice reference (mixed Indonesian + English, technical-friendly). Key conventions:

- **Loanwords from English are normal:** `library`, `framework`, `editor`, `server`, `client`, `database`, `auth`, `route`, `middleware`, `plugin`. Don't translate them.
- **Use Indonesian for:** UI strings (per `apps/web/src/locales/id.ts`), high-level explanations, stakeholder summaries.
- **Use English for:** code, env vars, file paths, function names, type names, citations.
- **"Anda" (formal) for user-facing.** "Kamu" only in casual product copy.

### Code blocks

- **Three backticks + language tag** for every block (```ts, ```bash, ```mermaid, ```yaml). The tag is required.
- **One concept per block.** A block should answer one question. Two questions → two blocks.
- **Include the relevant context, not just the function signature.** When showing `canRead`, include the surrounding helper that explains *why* `collaborators` grants implicit editor.
- **Format Yjs / TipTap snippets using the same shapes the actual library uses.** Don't invent methods.

```ts
// Good: real shape, anchored
const editor = createEditor({
  target,
  collaboration: {
    room: 'doc-abc123',
    provider: 'websocket',
    websocketUrl: 'wss://dev-docflow-server.kedata.cloud/collab',
    user: { name: 'Alice', color: '#ff0000' },
    onAwarenessChange: (states) => { /* … */ },
  },
})
```

```ts
// Bad: shape doesn't match reality
const editor = new Y.Doc({ /* … */ })
```

### Mermaid

- Use `flowchart` for system / architecture diagrams, `sequenceDiagram` for time-ordered flows.
- Subgraph titles in PascalCase or single noun (`Browser`, `ServerHost`). Not sentence fragments.
- Prefer `direction LR` for horizontal (system) or `TB` for vertical (sequence + layered).
- Edge labels are short verbs / protocols: `-- "HTTPS GET" -->`, `-- "WS Yjs binary" -->`. Don't put full sentences on edges.
- Use `autonumber` on sequence diagrams.
- Always include the diagram in the same `.md` file as the prose it illustrates — keep code, diagrams, and explanation together.

---

## 4. Style patterns

### Open a doc with a one-paragraph TL;DR

```md
> **TL;DR.** DocFlow is a self-hostable Google-Docs-style editor shipped
> as three artifacts: a Vue 3 SPA (`apps/web`), an Express API + WS
> server (`apps/server`), and a headless + Vue library (`packages/*`).
> Yjs CRDT is the authoritative model for documents; everything else
> is a derived view.
```

### Layered docs

For multi-layered systems, structure docs as:

1. TL;DR
2. Process / system model (mermaid flowchart)
3. Per-component deep-dive (each its own subsection)
4. Cross-cutting concerns (security, scaling, failure modes)
5. Extension points / "where do I add X"
6. References

If a reader can stop at any subsection and still have a useful answer, the doc is well-layered.

### Comparisons

When comparing options (providers, deployment modes, schemas), use a table with a "when to pick" column:

| Backend | When to pick |
|---------|-------------|
| `STORAGE_BACKEND=gridfs` | Single-container dev / very small prod; no S3 dependency |
| `STORAGE_BACKEND=s3` | Multi-instance; cloud-native; need presigned URLs |

Not "Backend A is good, Backend B is also good, choose what works for you."

### Failure modes

For any feature, document:

- **What it assumes** (e.g. "assumes `VITE_API_BASE_URL` is empty for same-domain mode")
- **What happens when the assumption breaks** (e.g. "if `VITE_API_BASE_URL` is set, the Vite dev proxy is bypassed")
- **How to verify the assumption** (e.g. "curl http://localhost:5174/api/health → JSON, not HTML")

This pattern is called out in `AGENTS.md` for the `docs/DEPLOYMENT.md` doc — apply it everywhere.

### Anti-patterns

- ❌ "In this article, we will explore how DocFlow handles real-time collaboration." → ✅ "Yjs is the authoritative CRDT for documents. See §6.2."
- ❌ Screenshots of UI you don't own → describe in prose
- ❌ "I'm excited to announce…" → ✅ "PR #97 ships Phase 9 P9-4 (comments)."
- ❌ "Many users have asked about…" → ✅ "If you hit X, do Y (see §3.4)."
- ❌ Emoji as decoration → only when literal (e.g. `🟢` for `shipped (prod)` in a status table)
- ❌ PR descriptions with no "Try it" or "Verification" block

---

## 5. Reference style for cross-team work

When writing for a team that isn't using DocFlow yet (sales, partner enablement, etc.):

- **Lead with the customer outcome**, not the architecture. "Collaborate live with no merge conflicts" beats "uses Yjs CRDT."
- **Name the constraints** the customer will care about: self-hosted (air-gap compatible), OpenAI-compatible AI, all data behind your perimeter.
- **Tie back to a code path** for credibility: "Live cursor + selection (see `apps/web/src/components/EditorView.vue`'s `presentPeers`)."
- **Don't oversell license terms.** If you don't know, link to `LICENSE` (proprietary EULA reference).

When writing for a team that's already using DocFlow:

- **Lead with the API.** Show the request / response shape.
- **Show the failure case.** `400 Bad Request`, `403 Forbidden`, `404 Not Found`, `429 Too Many Requests`, `500 Internal Server Error` — what they mean + how to handle them.
- **Anchor everything** so they can ctrl-click to the source.

---

## 6. Citation in code

When writing code comments (rare; mostly in spec docs):

```ts
/**
 * Phase 9 P9-4 — denormalize the resolver's display name so the
 * sidebar can render \"Resolved by Alice\" without a join. Lookup
 * happens once at resolve-time; UI falls back to the raw id if
 * the name is missing (older records).
 * See docs/plans/sprint-9-10-execution-plan.md §2 RO1.
 */
```

Cite the **decision**, not the **file**. The reader can find the file; what's harder is understanding *why* the code is the way it is.

For inline `// comment`, anchor the source of truth:

```ts
// Phase 9 RO3 — drop inbound sync messages (type byte = 0 → MESSAGE_SYNC)
// to prevent viewer / commenter from mutating the shared doc.
// See setupReadOnlyWSConnection in apps/server/src/index.ts.
```

---

## 7. Release notes (when shipping a PR)

### Structure

```md
## <one-line summary>

<one-paragraph context: what was the user-visible problem, what is
the new behaviour, what is the deployment risk.>

### Changes

<bulleted list of user-visible changes, each anchored to a file
or function. Group by audience: API, library, deploy.>

### Try it

```bash
<concrete commands to test the change locally>
```

### Verification

```bash
<typecheck + tests + lint>
```

### Out of scope

<what this PR explicitly does NOT do — future PR territory.>
```

### Example

```md
## Phase 9 C1 + C2 + C3 — atomic Comments

Atomic PR closing the Phase 9 P9-4 cornerstone. The plan §6 risk rows
*"Real-time comment fan-out"* + *"Comment anchor survival"* mandate:
**broadcast, not poll**, and the mark carries **id-only** (no text).

### Changes

- **`packages/plugins/src/comment.ts`** (NEW) — `CommentMark` carries
  only `threadId` + `pos`. Mark is inclusive so typing inside an
  existing comment extends it.
- **`apps/server/src/models/CommentThread.ts`** (NEW) — `threadId` (UUID),
  `docId`, `anchorText`, `anchorPos`, `authorId`, `replies[]`, `resolved`,
  `resolvedBy`, `resolvedByName`, `resolvedAt`.
- **`apps/server/src/routes/comments.ts`** (NEW) — GET / POST /
  PATCH / DELETE, role-gated via `canRead` / `effectiveRole`.
  Viewer 403 on create/reply/resolve; commenter + editor + owner pass.
- **`apps/server/src/utils/broadcast.ts`** (NEW) — WS broadcast helper.
  REST mutations broadcast `comment:created` etc. on the existing
  collab WS so connected peers see the change within one round-trip.

### Try it

\`\`\`bash
pnpm dev:server       # apps/server on :3001
pnpm dev:web          # apps/web on :5174 (Vite proxies /api/* → :3001)
\`\`\`

Select text in the editor → Comments sidebar → post. The thread
appears immediately. Open a second tab → the thread appears
within one round-trip (no reload).

### Verification

\`\`\`bash
pnpm --filter @kedata-indonesia/docflow-server test:unit  # 199 tests
pnpm test:unit                                           # full suite
\`\`\`
```

---

## 8. Reference patterns for AI agents writing or running DocFlow

### When you write a doc

- **First-pass outline:** headings only. If a heading is unclear, rewrite it before adding prose.
- **Second pass:** TL;DR + mermaid + one paragraph per heading. Stop. **Don't fill in every paragraph.** Headings + TL;DR + diagrams answer 80% of "where do I find X" questions.
- **Third pass (review):** every fact has a citation. Every code path name matches the file. No marketing words. No screenshots of UI you don't own.
- **Fourth pass (review):** the doc survives a 30-second skim. Can a reader find the answer to their question in 30 seconds?

### When you write a PR

- **Title:** `<scope>: <verb in imperative> <object>` — `feat(phase-9): C1+C2+C3 — comments`. No "improved", no "added support for".
- **Description body:** summary → context → changes (grouped by audience) → "Try it" → "Verification" → "Out of scope".
- **Link to the plan section** that motivated the work.
- **List every file** you touched with the diff stats at the top of the description.

### When you read someone else's code

- **Don't trust inline comments alone.** Comments can rot. Verify by reading the function call below the comment.
- **Start at the entry point**, not the middle. For DocFlow: `packages/core/src/Editor.ts` (library entry) or `apps/server/src/index.ts` (server entry).
- **Find the seams:** port calls, mount points, model boundaries. For DocFlow, the seams are catalogued in `docs/ARCHITECTURE.md` §2 (library boundary).

### When you debug

- **Start with the error message and follow it upstream.** "Cannot POST /api/documents/.../comments" → which server is running this code? → is the route registered? → does the server image include the PR? (See `docs/ARCHITECTURE.md` §1 deploy trap.)
- **Don't assume which layer is wrong.** It could be the SPA bundle (cache), the nginx config, the server routes, or the data. Verify each.
- **One variable at a time.** Change one thing, test, change one thing, test.

---

## 9. Tone & voice — common pitfalls

| Pitfall | Avoid | Use instead |
|---------|-------|-------------|
| Marketing fluff | "leverages", "synergy", "seamless", "delight", "unlock" | "implements", "replaces", "broadcasts", "derives", "uses" |
| Hedge words | "might", "could potentially", "perhaps", "somewhat" | "does", "is", "will" (or be explicit: "we haven't decided yet") |
| Vague quantifiers | "many", "some", "a lot", "various" | "287 tests", "60ms", "4 servers", "9 tasks" |
| Pronoun over-use | "we then did X, and we did Y, and then we did Z" | "Then we did X. Then Y. Then Z." |
| Excited framing | "🚀 huge release", "I'm excited to announce", "🎉" | "PR #97 ships Phase 9 P9-4 (comments)." |
| Crutch openings | "It is worth noting that…", "I would like to point out…" | Just say it. |
| Passive voice | "the file was edited", "the test was run" | "I edited the file", "the test ran" |
| Double hedging | "It might be possible that…" | "It might…" or "It is possible…" — pick one |

When in doubt, **read it aloud**. If you wouldn't say it in a meeting, don't write it.

---

## 10. Glossary (DocFlow-specific terms)

When you encounter one of these terms in the codebase or docs, use them consistently:

| Term | Meaning |
|------|---------|
| **Library** | The six published `packages/*` — headless + Vue editor. Storage-agnostic, backend-agnostic. |
| **Host** | `apps/web` + `apps/server` — the product app + API that runs the library for end users. |
| **Authoritative state** | The single source of truth (Yjs Y.Doc for collab documents; Mongo `User` for identity; etc.). Everything else is a derived view. |
| **Derived read-model** | A field computed from authoritative state on demand (`Document.content` is a derived read-model of the Yjs Y.Doc; `Document.plainText` is derived from `content` via `extractPlainText` in `models/Document.ts`). |
| **Port / Injection port** | A function or option the library accepts so the host can plug in behavior (`onImageUpload`, `collaboration`, `aiStream`). Catalogued in `docs/LIBRARY_CONTRACT.md`. |
| **Live cursor** | The position + selection of a remote peer, rendered in the editor. Powered by Yjs awareness (not the REST heartbeat). |
| **Awareness** | Yjs transient state per client (cursor, color, name). Not persisted to `CollabState`. |
| **Persistence / Debounce** | `CollabState` collection (Yjs binary, debounced 2.5s; flushed on last peer disconnect). NOT the same as `Document.content` which is a derived read-model. |
| **Role** | One of `viewer` / `commenter` / `editor` / `owner`. Per-document. Default for legacy `collaborators` is `editor`. Enforced at three layers (HTTP, WS, model). |
| **License mode** | One of `community` / `professional` / `enterprise` / `government`. Per-deployment, encoded in license file (Sprint 11+). |
| **Compatibility matrix** | The list of AI providers we've tested (DeepSeek, OpenAI, Ollama, vLLM, LM Studio, OpenRouter, Claude). Each pinned by a fixture test in `apps/server/src/ai/__tests__/`. |
| **Compat test fixture** | A recorded (mock) SSE response from an AI provider, used to pin the wire shape we depend on (`apps/server/src/ai/__tests__/openaiCompat.spec.ts`). |
| **Fan-out** | Push notification from a REST mutation to all WS-connected peers for the same document. The `utils/broadcast.ts` helper routes by `roomId`. |
| **Branch / commit SHA** | When citing state, anchor to a branch + SHA (`main` @ `a25e96d`). Never "current". |

---

## 11. Working with the repo (for AI agents)

### Read order

When you join a DocFlow task:

1. **`docs/ARCHITECTURE.md`** — system map (§1–7), extension points (§10), safety contract (§12).
2. **`docs/plans/sprint-9-10-execution-plan.md`** — what's shipped + what's left.
3. **`docs/LIBRARY_CONTRACT.md`** — port definitions (only if you'll touch `packages/*`).
4. **`AGENTS.md`** — commands + invariants.
5. **`CLAUDE.md`** — same target, different format.
6. The plan file relevant to your task (`docs/plans/phase-N-*.md`).

### Edit order

1. **lint** → 2. **typecheck** → 3. **test:unit** → 4. **(test:e2e if UI/layout changed)** → 5. **build affected packages** (per `AGENTS.md`).
2. For server-side changes: **also redeploy the server container on Dokploy** (web-on-push does NOT do this).
3. Open a PR with: title in imperative + summary → context → changes → try-it → verification → out-of-scope.

### Citation in commits

Commit message format:

```
<scope>(<phase-or-area>): <imperative verb> <object>

<one-line context: what was wrong, what's new, what's the risk>

### <area 1>
- bullet (with file path)
- bullet (with file path)

### <area 2>
- bullet
```

Examples (from the actual repo):

```
feat(phase-9): C1+C2+C3 atomic — comments (library + server + UI)

Atomic PR closing the Phase 9 P9-4 cornerstone. The plan §6 risk rows
*"Real-time comment fan-out"* + *"Comment anchor survival"* mandate:
broadcast, not poll, and the mark carries id-only (no text).

### C1 — library: commentPlugin
- packages/plugins/src/comment.ts: CommentMark with threadId + pos
  attributes; v1 absolute position, v2 will use Yjs RelativePosition.
…
```

### Anchoring a commit to a plan

Every PR should anchor to a plan section. If it doesn't, the PR is probably unscoped.

```
Phase 9 C1+C2+C3 — atomic Comments            ← subject

…  See docs/plans/sprint-9-10-execution-plan.md §3 row C1+C2+C3
      (acceptance gate: §2).  …
```

---

## 12. Working with humans (for AI agents supporting a team)

### Tone

- **Acknowledge context first**, then act. "I see you're in the middle of a deploy — let me check the server image timestamp before suggesting anything."
- **Be explicit about confidence.** "I'm 90% confident this is a server rebuild issue. To confirm, check X."
- **Surface trade-offs, don't hide them.** "We could ship this with a temporary hack, or spend 30 min on the right fix. Your call."
- **Reference, don't over-explain.** The human has the context; they need the *new* information.

### Asking for help

Per `AGENTS.md` (and the Claude Code tools generally): use the `question` tool when you're genuinely uncertain. Don't ask if the codebase has the answer.

**Good questions:**
- "Is the server container a separate Dokploy service, or part of a single image?"
- "Should this PR add a license enforcement check, or defer to Sprint 11?"
- "Do you want me to also update `LICENSE` / `NOTICE` for the new dep?"

**Bad questions:**
- "Where do I find the auth code?" (grep `auth.ts`)
- "What does the AI proxy do?" (read `docs/ARCHITECTURE.md` §3.4)
- "Should I test this?" (per `AGENTS.md`, yes — lint, typecheck, test:unit before declaring done)

### Handoff

When handing off work:

- **Commit + push + PR** (don't leave local-only).
- **Update the plan** (`docs/plans/sprint-9-10-execution-plan.md` status table; cite the PR).
- **Note what you deferred.** "I didn't add tests for X because Y — see PR description 'Out of scope'."
- **One sentence on what's next.** "After this lands, the next high-leverage pivot is Z (see §10)."

---

## 13. Reference index

| Topic | File |
|-------|------|
| System architecture | `docs/ARCHITECTURE.md` |
| Library contract | `docs/LIBRARY_CONTRACT.md` |
| Deploy guide | `docs/DEPLOYMENT.md` |
| AI provider matrix | `docs/AI_PROVIDERS.md` |
| Sprint status | `docs/plans/sprint-9-10-execution-plan.md` |
| Phase plans | `docs/plans/phase-0..9-*.md` |
| Agent rules | `AGENTS.md` |
| Library + agent + orchestration | `CLAUDE.md`, `.opencode/agents/*.md` |
| Third-party licenses | `NOTICE` |
| License | `LICENSE` |