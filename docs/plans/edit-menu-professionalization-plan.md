# Edit Menu Professionalization — Development Plan

**Scope:** bring the `Edit` menu from a display-only stub to a fully functional, Google Docs-class editing surface. The plan covers clipboard operations, selection/deletion, and find-and-replace.

**Status:** draft for review; not committed to code.  
**Target location:** `packages/vue` (library chrome) and `apps/demo` (host wiring).  
**Out of scope:** collaborative cursors in find-and-replace (Phase 9), track-changes integration (Phase 9), and custom undo/redo beyond TipTap history.

---

## 1. Goals

1. Close the functional gap against the Google Docs `Edit` menu benchmark provided by the user.
2. Make every menu item either **work end-to-end** or **not appear** (no more no-op stubs).
3. Use TipTap/ProseMirror native commands where possible to avoid reinventing the wheel.
4. Add keyboard shortcuts that match the benchmark (`⌘Z`, `⌘Y`, `⌘X`, `⌘C`, `⌘V`, `⌘+Shift+V`, `⌘A`, `⌘+Shift+H`).
5. Keep the library / app boundary clean: `packages/vue` owns chrome, `apps/demo` owns host wiring.

---

## 2. Current State Audit

All claims below are verified against the current tree (`main @ 0be7e00`).

### 2.1 Already displayed in the menu

| Menu item | Handler location | Implementation quality |
|-----------|------------------|------------------------|
| Undo | `HeaderBar.vue:133` → `DocsEditor.vue:menuClick` → `emit('menu-click')` | **Stub — emits event, no handler** |
| Redo | `HeaderBar.vue:134` → same | **Stub** |
| Select all | `HeaderBar.vue:136` → same | **Stub** |

### 2.2 Missing from the menu (Google Docs benchmark)

| Menu item | Problem | Where it hurts |
|-----------|---------|----------------|
| **Cut** | Not in menu. | Users expect clipboard cut. |
| **Copy** | Not in menu. | Users expect clipboard copy. |
| **Paste** | Not in menu. | Users expect clipboard paste. |
| **Paste without formatting** | Not in menu. | Power users expect plain-text paste. |
| **Delete** | Not in menu. | Users expect delete selection. |
| **Find and replace** | Not in menu. | Core editing feature. |

### 2.3 Foundational gaps

- **No clipboard abstraction.** There is no helper for copy/paste/cut.
- **No find-and-replace engine.** No search UI, no replace logic, no highlight.
- **No keyboard shortcut registration.** The editor relies on browser defaults for copy/paste, but menu items are not wired.
- **No undo/redo handler.** The menu emits `undo`/`redo` but no one listens.

---

## 3. Target UX (Google Docs benchmark)

```
Edit
├── Undo                    ⌘Z
├── Redo                    ⌘Y
├── ──────────────
├── Cut                     ⌘X
├── Copy                    ⌘C
├── Paste                   ⌘V
├── Paste without formatting ⌘+Shift+V
├── ──────────────
├── Select all              ⌘A
├── Delete
├── ──────────────
└── Find and replace        ⌘+Shift+H
```

We will implement the items above that are **not yet done** and keep the existing ones.

---

## 4. Architectural Principles

1. **Use TipTap/ProseMirror commands.** The editor already has `editor.commands.undo()`, `editor.commands.redo()`, `editor.commands.selectAll()`, and clipboard event handling. We should call these instead of reimplementing.
2. **Library owns the command execution.** `DocsEditor.vue` should handle Edit menu actions internally (it has direct access to the editor instance). No need to emit `menu-click` for editor-specific commands.
3. **Clipboard is a library concern.** Copy/paste/cut should use the browser's Clipboard API with fallback to `document.execCommand`.
4. **Find and replace is a library feature.** It needs a search UI and ProseMirror search/replace plugin. This is a bigger sub-project.

---

## 5. Feature Specification

### 5.1 Undo / Redo

**Goal:** `Edit → Undo` and `Edit → Redo` work via TipTap history.

**Implementation:**
- In `DocsEditor.vue`, handle `undo` and `redo` actions in `menuClick`.
- Call `editor.commands.undo()` and `editor.commands.redo()`.
- Disable menu items when there's nothing to undo/redo (optional, requires history state tracking).

**Files to change:**
- `packages/vue/src/components/DocsEditor.vue` — add undo/redo cases in `menuClick`.
- `packages/vue/src/components/HeaderBar.vue` — optionally add `disabled` state for undo/redo.

**Acceptance:**
- `Edit → Undo` reverts the last edit.
- `Edit → Redo` reapplies the undone edit.
- Keyboard shortcuts `⌘Z` and `⌘Y` work (TipTap already handles these natively).

---

### 5.2 Select All

**Goal:** `Edit → Select all` selects the entire document content.

**Implementation:**
- In `DocsEditor.vue`, handle `select-all` action in `menuClick`.
- Call `editor.commands.selectAll()`.

**Files to change:**
- `packages/vue/src/components/DocsEditor.vue` — add `select-all` case.

**Acceptance:**
- `Edit → Select all` selects all document content.
- Keyboard shortcut `⌘A` works (TipTap already handles this natively).

---

### 5.3 Cut / Copy / Paste

**Goal:** `Edit → Cut`, `Edit → Copy`, `Edit → Paste` use the browser clipboard.

**Implementation:**
- Use the modern Clipboard API (`navigator.clipboard.readText()` / `writeText()`) with fallback to `document.execCommand` for older browsers.
- Cut: copy selection to clipboard, then delete selection.
- Copy: copy selection to clipboard.
- Paste: read clipboard text, insert at cursor (as plain text by default, or use ProseMirror's paste command for rich text).

**Files to change:**
- `packages/vue/src/components/DocsEditor.vue` — add cut/copy/paste cases in `menuClick`.
- `packages/vue/src/composables/useClipboard.ts` (new) — clipboard helper with fallback.

**Acceptance:**
- Cut removes selection and copies to clipboard.
- Copy copies selection to clipboard.
- Paste inserts clipboard content at cursor.
- Keyboard shortcuts `⌘X`, `⌘C`, `⌘V` work (browser native).

---

### 5.4 Paste without formatting

**Goal:** `Edit → Paste without formatting` inserts clipboard content as plain text.

**Implementation:**
- Read clipboard text via Clipboard API.
- Insert as plain text at cursor (strip all formatting).
- Use `editor.commands.insertContent(text)` or `editor.commands.insertContentAt(pos, text)`.

**Files to change:**
- `packages/vue/src/components/DocsEditor.vue` — add `paste-without-formatting` case.
- `packages/vue/src/composables/useClipboard.ts` — add plain-text paste helper.

**Acceptance:**
- Paste without formatting inserts clipboard content as plain text.
- No formatting from the source is preserved.
- Keyboard shortcut `⌘+Shift+V` works (if we register it; browser doesn't handle this natively).

---

### 5.5 Delete

**Goal:** `Edit → Delete` deletes the current selection (or the character after cursor if no selection).

**Implementation:**
- In `DocsEditor.vue`, handle `delete` action in `menuClick`.
- Call `editor.commands.deleteSelection()` if there's a selection, or `editor.commands.deleteRange({ from, to })` for a specific range.
- For no selection, delete the character after cursor (like Backspace).

**Files to change:**
- `packages/vue/src/components/DocsEditor.vue` — add `delete` case.

**Acceptance:**
- `Edit → Delete` removes the selected content.
- If no selection, deletes the character after cursor.

---

### 5.6 Find and Replace

**Goal:** `Edit → Find and replace` opens a search UI and allows replacing text.

**This is the largest sub-project in Edit menu.** It requires:
- A search UI (input field, next/previous buttons, replace input, replace button, replace all button).
- A ProseMirror plugin for search highlighting.
- A replace engine that walks the document and replaces matches.

**Options:**

**Option A — Use existing TipTap extension:**
- Check if `@tiptap/extension-search-and-replace` or similar exists.
- If yes, install and configure it.
- If no, implement custom.

**Option B — Custom implementation:**
- Create a search plugin that:
  - Finds all matches of a search term in the document.
  - Highlights them with decorations.
  - Allows navigation between matches (next/previous).
  - Replaces current match or all matches.
- Create a search UI component in `packages/vue`.

**Recommended:** Option B (custom) because we need full control over the UI and it integrates with our existing design system.

**Files to change:**
- `packages/vue/src/components/FindReplaceDialog.vue` (new) — search UI.
- `packages/vue/src/components/DocsEditor.vue` — handle `find-replace` action, render dialog.
- `packages/core/src/plugins/search.ts` (new) — search/replace plugin (or use existing if available).
- `packages/vue/src/locales/` — add strings.

**Acceptance:**
- `Edit → Find and replace` opens a search dialog.
- User can search for text; matches are highlighted.
- User can navigate between matches (next/previous).
- User can replace current match or all matches.
- Keyboard shortcut `⌘+Shift+H` works.

---

## 6. Component & Wiring Plan

### 6.1 `packages/vue` (library chrome)

| File | Changes |
|------|---------|
| `HeaderBar.vue` | Add Cut, Copy, Paste, Paste without formatting, Delete, Find and replace menu items. Add keyboard shortcut labels. |
| `DocsEditor.vue` | Handle all Edit menu actions internally (undo, redo, select-all, cut, copy, paste, paste-without-formatting, delete, find-replace). |
| `FindReplaceDialog.vue` (new) | Search UI with input, next/previous, replace, replace all. |
| `composables/useClipboard.ts` (new) | Clipboard helper with fallback. |
| `locales/en.ts` / `id.ts` | Add translation keys for Edit menu items and Find/Replace dialog. |

### 6.2 `apps/demo` (host wiring)

| File | Changes |
|------|---------|
| `EditorView.vue` | No changes needed — Edit actions are handled internally by DocsEditor. |
| `api.ts` | No changes. |

### 6.3 `apps/server` (backend)

| File | Changes |
|------|---------|
| — | No changes needed. Edit menu is purely client-side. |

---

## 7. Keyboard Shortcuts

| Action | Shortcut | Implementation |
|--------|----------|----------------|
| Undo | `⌘Z` | TipTap native (already works) |
| Redo | `⌘Y` | TipTap native (already works) |
| Cut | `⌘X` | Browser native (already works) |
| Copy | `⌘C` | Browser native (already works) |
| Paste | `⌘V` | Browser native (already works) |
| Paste without formatting | `⌘+Shift+V` | Custom registration needed |
| Select all | `⌘A` | TipTap native (already works) |
| Find and replace | `⌘+Shift+H` | Custom registration needed |

For custom shortcuts (Paste without formatting, Find and replace), register them in `DocsEditor.vue` using `editor.registerPlugin` or a global keydown handler.

---

## 8. Localization

New keys needed (in both `en.ts` and `id.ts`):

```ts
header: {
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  pasteWithoutFormatting: 'Paste without formatting',
  delete: 'Delete',
  findAndReplace: 'Find and replace',
}
editor: {
  findReplace: {
    title: 'Find and replace',
    findPlaceholder: 'Find in document',
    replacePlaceholder: 'Replace with',
    next: 'Next',
    previous: 'Previous',
    replace: 'Replace',
    replaceAll: 'Replace all',
    noMatches: 'No matches',
    matchCount: '{current} of {total}',
    close: 'Close',
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit tests

- `useClipboard.ts` — copy/paste/cut with fallback.
- `search.ts` plugin — find matches, navigate, replace.

### 9.2 Component tests

- `HeaderBar` renders Edit menu items with correct labels and shortcuts.
- `DocsEditor` handles undo/redo/select-all correctly.
- `FindReplaceDialog` searches, highlights, navigates, and replaces.

### 9.3 E2E tests

- `Edit → Undo` reverts last edit.
- `Edit → Copy` + `Edit → Paste` duplicates content.
- `Edit → Paste without formatting` strips formatting.
- `Edit → Find and replace` finds and replaces text.

---

## 10. Sequencing & Phases

We recommend delivering this in two small, reviewable milestones.

### Phase EM-1: Basic Editing Operations
- Undo, Redo, Select all (already in menu, just wire them)
- Cut, Copy, Paste
- Paste without formatting
- Delete
- Keyboard shortcuts for all

### Phase EM-2: Find and Replace
- Search plugin
- FindReplaceDialog UI
- Keyboard shortcut

**Rationale:** EM-1 is quick and unblocks the most common editing operations. EM-2 is more complex and can be reviewed separately.

---

## 11. Risks & Decisions

| Risk | Mitigation |
|------|------------|
| **Clipboard API requires permissions.** | Use fallback to `document.execCommand` for older browsers. Request clipboard permission gracefully. |
| **Paste rich vs plain text.** | Use ProseMirror's `paste` command for rich text; use `insertContent` for plain text. |
| **Find and replace is complex.** | Start with basic string matching (no regex). Add regex support later if needed. |
| **Undo/redo state tracking.** | TipTap history handles this. For menu disabled state, use `editor.can().undo()` and `editor.can().redo()`. |
| **Keyboard shortcut conflicts.** | Ensure custom shortcuts don't conflict with browser or editor defaults. |

---

## 12. Open Questions for Product Review

1. **Find and replace:** Do we need regex support, or is plain string matching enough for now?
2. **Paste:** Should `Edit → Paste` use rich text (preserve formatting) or plain text by default? Google Docs uses rich text.
3. **Delete:** Should `Edit → Delete` delete the selection or the entire document if nothing is selected? Google Docs deletes selection only.
4. **Keyboard shortcuts:** Should we show shortcut hints in the menu items (like Google Docs does)?

---

## 13. Files That Will Be Created or Modified

### New files
- `packages/vue/src/components/FindReplaceDialog.vue`
- `packages/vue/src/composables/useClipboard.ts`
- `packages/core/src/plugins/search.ts` (or use existing extension)

### Modified files
- `packages/vue/src/components/HeaderBar.vue`
- `packages/vue/src/components/DocsEditor.vue`
- `packages/vue/src/locales/en.ts`
- `packages/vue/src/locales/id.ts`
- `packages/vue/src/index.ts` (export FindReplaceDialog if needed)

---

*End of plan. Ready for review before implementation begins.*
