# File Menu Professionalization — Development Plan

**Scope:** bring the `File` menu from a working baseline to an industry-standard, Google Docs-class document management surface. The plan covers the missing menu items, the rough edges in the existing items, and the backend/data changes required to support them.

**Status:** draft for review; not committed to code.  
**Target location:** `apps/demo` (reference host) and `packages/vue` (library chrome) with server-side support in `apps/server`.  
**Out of scope:** full roles/permissions rewrite (Phase 9 already owns that), real-time comments/versioning (Phase 9), dedicated PDF renderer (Phase 5), and a separate `apps/web` consumer (Phase 3).

---

## 1. Goals

1. Close the functional gap against the Google Docs `File` menu benchmark provided by the user.
2. Keep the **library / app boundary** clean: `packages/vue` owns chrome, `apps/demo` owns persistence wiring, `apps/server` owns data.
3. Make every menu item either **work end-to-end** or **not appear** (no more no-op stubs).
4. Preserve existing behavior: New, Open, Make a copy, Share, Download, Rename, Move, Move to trash, Version history, Language, Page setup, Print.
5. Add support for: **Email**, **Document details/properties**, **Make available offline**, **Add shortcut to Drive/Starred**, and a proper **Trash/soft-delete** lifecycle.

---

## 2. Current State Audit

All claims below are verified against the current tree (`main @ e28950e`).

### 2.1 Already implemented and wired

| Menu item | Handler location | Implementation quality |
|-----------|------------------|------------------------|
| New | `HeaderBar.vue:91` → `EditorView.vue:249` → `App.vue:257` | Creates blank or templated doc; opens it. |
| Open | `HeaderBar.vue:92` → `EditorView.vue:252` → `App.vue:324` | Returns to dashboard. |
| Make a copy | `HeaderBar.vue:93` → `EditorView.vue:255` → `App.vue:373` | Clones content; opens copy. |
| Share | `HeaderBar.vue:95` → `EditorView.vue:284` | Modal with link copy + collaborator invite. Backend: `PUT /api/documents/:id/collaborators`. |
| Download | `HeaderBar.vue:98-107` → `EditorView.vue:273` → `export.ts:337` | 7 real formats + PDF stub (`window.print()`). |
| Rename | `HeaderBar.vue:110` | Inline title editing. Persists via `@update:title`. |
| Move | `HeaderBar.vue:111` → `EditorView.vue:258` → `App.vue:415` | Dialog picks folder; persists `folderId`. |
| Move to trash | `HeaderBar.vue:112` → `EditorView.vue:261` → `App.vue:397` | Hard delete with browser `confirm()`. |
| Version history | `HeaderBar.vue:114` → `DocsEditor.vue:449` | Toggles `history` sidebar key, but the sidebar is not mounted inside `DocsEditor` (Phase 9 orphan). |
| Language | `HeaderBar.vue:117-121` | English / Indonesia switch. Persists to `localStorage`. |
| Page setup | `HeaderBar.vue:122` → `DocsEditor.vue:445` | Modal for paper size, orientation, margins. Updates layout. |
| Print | `HeaderBar.vue:123` → `DocsEditor.vue:447` | `window.print()` + print media CSS. |

### 2.2 Missing or stubbed

| Menu item | Problem | Where it hurts |
|-----------|---------|----------------|
| **Email** | Menu item exists but `EditorView.vue:264` case `email` is empty `break;` only. | Users see a clickable menu that does nothing. |
| **Add shortcut to Drive** | Not in the menu. | Benchmark expects this (or a "Starred" shortcut). |
| **Make available offline** | Not in the menu. | Offline editing is a Docs-class expectation. |
| **Details** | Not in the menu. | No document metadata view (word count, owner, created, modified). |
| **Security limitations** | Not in the menu. | No UI for who can view/edit. Share modal covers invite but not visibility settings. |
| **Move to trash** | Hard delete. No undo, no trash bin. | Deletion is destructive and inconsistent with Google Docs behavior. |
| **Download → PDF** | Emits `window.print()`, not a downloadable `.pdf` file. | Benchmark expects "PDF Document (.pdf)" download. |

### 2.3 Foundational gaps that block the menu items

- **No `trash` concept on the backend.** `DELETE /api/documents/:id` permanently removes the row. The dashboard has no "Trash" view.
- **No document metadata endpoint.** Details like word count, character count, owner name, and full audit history are computed ad-hoc in the client or absent.
- **No offline primitive.** There is no `y-indexeddb` or service-worker cache. The only offline signal is a string value in `StatusBar`.
- **No "shortcut/starred" model.** `Document.starred` exists but is document-owned; there is no per-user shortcut collection.
- **Email is unimplemented.** No `mailto` helper, no backend email service, no share-by-email flow.

---

## 3. Target UX (Google Docs benchmark)

The Google Docs `File` menu screenshot provides the following structure:

```
File
├── New
├── Open
├── Make a copy
├── Share         → sub-menu: Share with others, Copy link
├── Email         → sub-menu: Email this file, Email collaborators
├── Download      → sub-menu: DOCX, PDF, ODT, TXT, RTF, HTML-ZIP, HTML, MD
├── Rename
├── Move
├── Add shortcut to Drive
├── Move to trash
├── ──────────────
├── Version history
├── Make available offline
├── ──────────────
├── Details
├── Security limitations
├── Language
├── Page setup
└── Print
```

We will implement the items above that are **not yet done** and keep the existing ones.

---

## 4. Architectural Principles

1. **Library owns the chrome, host owns the data.** `HeaderBar.vue` and `DocsEditor.vue` in `packages/vue` emit events (`@menu-click`, `@share`, etc.). `apps/demo` wires those events to API calls. `apps/server` provides the persistence.
2. **Progressive enhancement.** Offline, email, and details are opt-in host concerns. The library components must gracefully degrade when the host does not provide a handler or prop.
3. **No destructive default.** Move to trash becomes a soft delete. Hard delete only happens from the Trash view (explicit empty trash or per-item delete).
4. **One source of truth.** Document content lives in the Yjs-backed editor. Metadata (title, owner, starred, trashed, collaborators) lives in Mongo. The UI merges both.
5. **Security first.** Every new API endpoint must enforce ownership/collaborator access. We will fix the existing `GET /api/documents/:id` hole while we are touching document access.

---

## 5. Feature Specification

### 5.1 Email

**Goal:** `File → Email` does something useful.

**Option A — Client-only "Email draft" (quick, pragmatic):**
- Open the user's default email client with a `mailto:` link.
- Subject: document title.
- Body: shareable link + a short note.
- Attachments are not supported because browser `mailto` cannot attach files.

**Option B — Server-side share-by-email (more complete):**
- `POST /api/documents/:id/email` with `{ to, message }`.
- Server sends an email with a link to the document.
- Requires an SMTP provider (SendGrid, AWS SES, etc.) and environment variables.
- Out of scope for this plan unless the user explicitly wants it; we will document it as a follow-up.

**Recommended scope for this plan:** Option A (client-side `mailto`) with a small modal that lets the user pick recipients, edit subject/body, and optionally attach the document as a download link. This gives immediate value without needing an SMTP server.

**Files to change:**
- `packages/vue/src/components/HeaderBar.vue` — add `Email` action (already present).
- `apps/demo/src/components/EditorView.vue` — handle `email` in `handleMenuClick`.
- `apps/demo/src/components/EmailDialog.vue` (new) — modal with recipient, subject, body, and `mailto:` generation.
- `apps/demo/src/locales/` or `packages/vue/src/locales/en.ts|id.ts` — add strings.

**Acceptance:**
- `File → Email` opens an email dialog.
- User can enter recipient(s), edit subject/body.
- "Send" opens the system email client with pre-filled fields.
- A copy-link button is available.

---

### 5.2 Document Details

**Goal:** `File → Details` opens a modal showing document metadata.

**Display fields:**
- Title (editable inline, same as header rename).
- Owner name/email.
- Created at / Last modified at.
- Word count, character count, page count (from `DocsEditor` stats).
- Storage location (folder).
- Document ID / shareable link.

**Data source:**
- Owner name/email from `/api/users/:id` or included in a new document metadata endpoint.
- Counts from the editor (already computed in `DocsEditor.vue`).

**Files to change:**
- `packages/vue/src/components/HeaderBar.vue` — add `Details` action.
- `packages/vue/src/components/DetailsDialog.vue` (new) — presentational modal.
- `apps/demo/src/components/EditorView.vue` — wire `details` action to open the dialog.
- `apps/server/src/routes/documents.ts` — add `GET /api/documents/:id/meta` or include owner details in `GET /api/documents/:id`.
- `apps/server/src/routes/users.ts` — ensure user lookup is available (already exists for share).

**Acceptance:**
- Details modal opens and displays correct metadata.
- Word/character/page counts match the status bar.
- Owner name/email is visible.
- Created/modified dates are formatted.

---

### 5.3 Make Available Offline

**Goal:** `File → Make available offline` persists the document to local storage so it can be edited without a network connection.

**Approach:**
- Use `y-indexeddb` (or equivalent) to mirror the room's Y.Doc locally.
- Add a toggle in the File menu: "Available offline" / "Remove offline copy".
- When offline, the editor continues to work; when the connection returns, the Yjs provider reconciles.
- The status bar shows an offline indicator.

**Constraints:**
- This interacts with Phase 1's authoritative Yjs persistence. We must avoid double-seeding the document from local cache when the server already has state.
- The offline toggle is per-document and per-user.

**Files to change:**
- `packages/vue/src/components/HeaderBar.vue` — add offline toggle action.
- `packages/core/src/Collaboration.ts` — optionally attach `IndexeddbPersistence` to the Y.Doc.
- `apps/demo/src/components/EditorView.vue` — pass offline preference to the editor and persist user preference (localStorage or user profile).
- `packages/vue/src/composables/useEditor.ts` — wire `IndexeddbPersistence` when enabled.
- `packages/vue/src/components/StatusBar.vue` — show offline/online state.

**Acceptance:**
- Toggle is available in File menu.
- When enabled, edits survive a page reload while disconnected from the network.
- Reconnecting merges local and server state without duplication.
- Status bar reflects offline/online/syncing state.

**Risk:** see §12.

---

### 5.4 Add Shortcut to Drive / Starred

**Goal:** `File → Add shortcut to Drive` (or "Add to Starred") gives the user quick access to a document from the dashboard.

**Decision:** The current `Document.starred` boolean is document-owned, not user-owned. We have two options:

- **Option A (simplest):** Keep using `Document.starred`, but make it a per-user property. Since the document is owned by a single user in this app, this works today. For collaborators, this is insufficient.
- **Option B (correct):** Create a `UserShortcut` collection with `{ userId, docId, createdAt }`. This is the Google Drive model and supports collaborators having their own shortcuts.

**Recommended:** Option A for now, because the current app is single-owner. We will rename the menu item to "Add to Starred" to match the existing dashboard concept. If/when multi-user sharing becomes real, we migrate to Option B.

**Files to change:**
- `packages/vue/src/components/HeaderBar.vue` — add `add-shortcut` action (or reuse existing `toggle-star`).
- `apps/demo/src/components/EditorView.vue` — handle `add-shortcut` by toggling `starred`.
- The existing star button in the header already toggles this; we just expose it in the menu.

**Acceptance:**
- `File → Add to Starred` toggles the starred state.
- Dashboard shows the document under Starred.

---

### 5.5 Move to Trash (Soft Delete)

**Goal:** Replace destructive delete with a trash lifecycle.

**Backend changes:**
- Add `deletedAt: Date | null` to `Document` schema.
- Change `DELETE /api/documents/:id` to a soft delete: set `deletedAt = now()`.
- Add `DELETE /api/documents/:id/permanent` for true deletion (only from Trash view).
- Add `POST /api/documents/:id/restore` to clear `deletedAt`.
- Update `GET /api/documents` to exclude trashed docs by default; add `?trash=true` to list them.
- Update `GET /api/documents/:id` to return 404 for trashed docs unless `?trash=true`.

**Frontend changes:**
- Rename `Move to trash` menu item (already there).
- Remove the browser `confirm()` from `App.vue:398` and instead use a non-blocking toast: "Moved to trash. Undo?"
- Add a "Trash" view in the dashboard listing trashed docs with Restore / Delete forever actions.

**Files to change:**
- `apps/server/src/models/Document.ts` — add `deletedAt`.
- `apps/server/src/routes/documents.ts` — soft delete, restore, permanent delete, list filters.
- `apps/demo/src/App.vue` — replace hard delete with soft delete; add trash view.
- `apps/demo/src/components/Dashboard.vue` — add Trash tab/view.
- `apps/demo/src/components/TrashView.vue` (new) — list, restore, delete forever.
- `packages/vue/src/locales/` — add strings.

**Acceptance:**
- `File → Move to trash` moves doc to trash and shows toast with undo.
- Trashed docs do not appear in All Documents / Starred.
- Trash view lists trashed docs.
- Restore returns doc to previous location.
- Delete forever permanently removes.

---

### 5.6 Security / Visibility Settings

**Goal:** Add a `Security limitations` (or "Share & permissions") item that lets the owner control who can access the document.

**Current state:**
- Collaborators are added via Share modal.
- `GET /api/documents/:id` has no access check (any auth user can read any doc).

**Scope:**
- Add a `visibility` field to documents: `private` (owner + collaborators only) or `restricted` (anyone with link can view).
- For this plan, keep it simple: `private` default.
- Fix `GET /api/documents/:id` to enforce access: owner, collaborator, or public visibility.
- The UI in Share modal gets a visibility toggle.

**Files to change:**
- `apps/server/src/models/Document.ts` — add `visibility: 'private' | 'restricted'`.
- `apps/server/src/routes/documents.ts` — enforce access on read; allow owner to update visibility.
- `apps/demo/src/components/ShareDialog.vue` (currently inline in `EditorView.vue`) — add visibility toggle.
- `packages/vue/src/components/HeaderBar.vue` — add `security` action that opens Share modal focused on permissions.

**Acceptance:**
- Non-owners cannot access private documents.
- Owner can set visibility.
- Share modal reflects current visibility.

**Note:** Full role-based access (viewer/commenter/editor) is Phase 9. We only add owner/collaborator/public visibility here.

---

### 5.7 Download PDF (proper file)

**Goal:** Replace `window.print()` with a real `.pdf` download.

**Options:**
- **Option A:** Use `html2pdf.js` or `jspdf` + `html2canvas` to generate a PDF from the rendered page.
- **Option B:** Server-side generation with `puppeteer` or `playwright` (heavy, needs a headless browser).
- **Option C:** Keep `window.print()` for now but relabel the menu item to "Print as PDF" so expectations match.

**Recommended:** Option A using `html2pdf.js` or `html2canvas` + `jsPDF`. This is the pragmatic client-side path. The user already said `.epub` is excluded; PDF is in scope.

**Files to change:**
- `apps/demo/src/utils/export.ts` — implement `pdf` case.
- `apps/demo/package.json` — add `html2pdf.js` or `html2canvas` + `jspdf` dependency.
- `packages/vue/src/locales/` — ensure PDF label exists.

**Acceptance:**
- `File → Download → PDF Document (.pdf)` downloads a `.pdf` file.
- PDF preserves page layout, headers/footers, and page breaks.

---

## 6. Data Model & API

### 6.1 `Document` schema updates

```ts
export interface IDocument {
  title: string
  content: object
  plainText: string
  owner: string
  collaborators: string[]
  starred: boolean
  folderId: string | null
  visibility: 'private' | 'restricted'   // new
  deletedAt: Date | null                 // new
  createdAt: Date
  updatedAt: Date
}
```

### 6.2 New / updated endpoints

| Method | Endpoint | Purpose | Authz |
|--------|----------|---------|-------|
| `PUT` | `/api/documents/:id` | Add `visibility` to update payload | Owner |
| `DELETE` | `/api/documents/:id` | Soft delete (set `deletedAt`) | Owner |
| `POST` | `/api/documents/:id/restore` | Clear `deletedAt` | Owner |
| `DELETE` | `/api/documents/:id/permanent` | Permanent delete | Owner |
| `GET` | `/api/documents?trash=true` | List trashed docs | Owner |
| `GET` | `/api/documents/:id` | Enforce owner/collaborator/public visibility | Owner/collaborator/public |
| `GET` | `/api/documents/:id/meta` | Metadata: owner, counts, dates | Owner/collaborator/public |

### 6.3 Client-side offline preference

Stored in `localStorage` under `docflow-offline-docs: [docId]` or as a user setting when a user profile exists. This is sufficient for the single-user demo.

---

## 7. Component & Wiring Plan

### 7.1 `packages/vue` (library chrome)

| File | Changes |
|------|---------|
| `HeaderBar.vue` | Add `Details`, `Security`, `Add to Starred`, `Make available offline` actions. Remove `Email` if host does not wire it, or keep it as an emit. |
| `DetailsDialog.vue` (new) | Presentational modal for document metadata. Props: `doc`, `owner`, `counts`, `isOpen`. Emits: `close`, `rename`. |
| `DocsEditor.vue` | Forward new `menu-click` actions to the host unchanged. Page setup, print, version history stay internal. |
| `locales/en.ts` / `id.ts` | Add translation keys for new menu items and dialogs. |

### 7.2 `apps/demo` (host wiring)

| File | Changes |
|------|---------|
| `EditorView.vue` | Handle `email`, `details`, `security`, `add-shortcut`, `make-offline` in `handleMenuClick`. Render new dialogs. |
| `EmailDialog.vue` (new) | `mailto:` composer modal. |
| `App.vue` | Soft delete logic; trash view; visibility update; offline preference. |
| `Dashboard.vue` | Add Trash tab; pass restore/delete-forever actions. |
| `TrashView.vue` (new) | Trashed documents list. |
| `api.ts` | Add restore, permanent delete, visibility update, metadata fetch. |
| `utils/export.ts` | Implement real PDF download. |

### 7.3 `apps/server` (backend)

| File | Changes |
|------|---------|
| `models/Document.ts` | Add `visibility` and `deletedAt`. |
| `routes/documents.ts` | Soft delete, restore, permanent delete, metadata endpoint, visibility update, access enforcement. |
| `routes/users.ts` | Keep existing user lookup; maybe add bulk user lookup for metadata. |

---

## 8. Security & Permissions

1. **Close the read gap.** `GET /api/documents/:id` must check owner, collaborator, or `visibility === 'restricted'`.
2. **Soft delete must also hide from reads.** Trashed documents return 404 unless explicitly requested from the trash list.
3. **Only owners can delete, restore, or change visibility.** Collaborators retain their existing read/write access.
4. **Offline copies are local-only.** No server risk from offline cache; reconciliation happens through the Yjs provider, which is already authenticated.
5. **Email links use public URLs only.** If visibility is private, the recipient must already be a collaborator or request access (future).

---

## 9. Localization

New keys needed (in both `en.ts` and `id.ts`):

```ts
header: {
  details: 'Details',
  security: 'Security limitations',
  addShortcut: 'Add shortcut to Drive',
  addToStarred: 'Add to Starred',
  removeFromStarred: 'Remove from Starred',
  makeAvailableOffline: 'Make available offline',
  removeOfflineCopy: 'Remove offline copy',
  email: 'Email',
}
editor: {
  details: { title, owner, createdAt, modifiedAt, wordCount, charCount, pageCount, location, link }
  email: { title, to, subject, body, send, copyLink }
  offline: { enabledToast, disabledToast }
  trash: { movedToTrash, undo, restore, deleteForever }
}
```

---

## 10. Testing Strategy

### 10.1 Unit tests

- `extractPlainText` still works after model changes.
- `documents.ts` route access control (owner, collaborator, public, trashed).
- Soft delete / restore / permanent delete logic.
- PDF export produces a Blob with correct MIME type.

### 10.2 Component tests

- `HeaderBar` renders new menu items and emits correct actions.
- `DetailsDialog` displays props correctly.
- `EmailDialog` generates a `mailto:` URL with escaped fields.
- `TrashView` restores and permanently deletes.

### 10.3 E2E tests

- `File → Email` opens the email dialog.
- `File → Move to trash` moves doc to trash and shows undo toast.
- Trash view restore returns doc to dashboard.
- Non-owner cannot access a private document.
- PDF download works.

---

## 11. Sequencing & Phases

We recommend delivering this in four small, reviewable milestones rather than one large PR.

### Phase FM-1: Foundation & Trash
- Add `deletedAt` and `visibility` to `Document`.
- Soft delete, restore, permanent delete, trash list endpoints.
- Update `GET /api/documents/:id` access control.
- Frontend: Trash view, soft delete toast, remove browser `confirm()`.

### Phase FM-2: Details & Security
- `GET /api/documents/:id/meta` endpoint.
- `DetailsDialog` component.
- Share modal visibility toggle.
- `Security limitations` menu item.

### Phase FM-3: Email & Starred
- `EmailDialog` with `mailto:` composer.
- `Add to Starred` menu item (reuse existing `starred` toggle).
- Localization for all new keys.

### Phase FM-4: Offline & PDF
- Real PDF download.
- `Make available offline` toggle with `y-indexeddb` mirror.
- Status bar offline state.

**Rationale:** FM-1 and FM-2 are data-heavy and unblock the rest. FM-3 is UI-only. FM-4 is the most technically risky (offline reconciliation, PDF rendering) so it comes last.

---

## 12. Risks & Decisions

| Risk | Mitigation |
|------|------------|
| **Offline double-seed** | Only attach `IndexeddbPersistence` after the server provider has synced. Do not seed from local cache if the server has a newer state. |
| **PDF generation quality** | Use the existing `PageView` rendered DOM as input to `html2pdf.js` so page breaks and margins are preserved. Test with tables and images. |
| **Scope creep into Phase 9** | We deliberately avoid full roles, comments, versioning, and suggestions. We only add owner/collaborator/public visibility. |
| **Trash vs. shared docs** | A trashed doc is hidden from collaborators. If a doc is shared and trashed by the owner, collaborators lose access. Document this behavior. |
| **Mailto UX** | Not all users have a default email client. Provide "Copy link" as a fallback in the Email dialog. |
| **Soft delete data retention** | Add a TTL index on `deletedAt` for auto-purge after 30 days, or document that trash is permanent until manually emptied. |

---

## 13. Open Questions for Product Review

1. **Email:** Should we implement client-side `mailto` only, or do we want a server-side email integration (requires SMTP provider)?
2. **Offline:** Do we want offline support in this milestone, or defer to Phase 9 (which already mentions offline)?
3. **PDF:** Should PDF be client-side (`html2pdf.js`) or server-side (`puppeteer`)?
4. **Starred vs. Shortcuts:** Do we keep the current document-owned `starred` flag, or create a proper per-user `UserShortcut` collection?
5. **Trash retention:** How long should trashed documents be kept before permanent deletion (30 days is standard)?
6. **Public visibility:** Do we want true "anyone with the link" public docs, or only private docs for now?

---

## 14. Files That Will Be Created or Modified

### New files
- `apps/demo/src/components/EmailDialog.vue`
- `apps/demo/src/components/TrashView.vue`
- `packages/vue/src/components/DetailsDialog.vue`

### Modified files
- `apps/server/src/models/Document.ts`
- `apps/server/src/routes/documents.ts`
- `apps/server/src/routes/users.ts` (maybe)
- `apps/demo/src/App.vue`
- `apps/demo/src/components/Dashboard.vue`
- `apps/demo/src/components/EditorView.vue`
- `apps/demo/src/api.ts`
- `apps/demo/src/utils/export.ts`
- `packages/vue/src/components/HeaderBar.vue`
- `packages/vue/src/components/DocsEditor.vue` (minor wiring)
- `packages/vue/src/locales/en.ts`
- `packages/vue/src/locales/id.ts`
- `apps/demo/package.json` (PDF dependency)

---

*End of plan. Ready for review before implementation begins.*
