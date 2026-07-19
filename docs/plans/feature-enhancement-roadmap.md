# Docflow Feature Enhancement Roadmap

**Scope:** comprehensive feature enhancement plan to bring Docflow from a working document editor to a Google Docs-class product. This document consolidates the analysis of the Google Docs benchmark and the current state of the app, and proposes a phased roadmap for implementation.

**Status:** draft for review; not committed to code.  
**Target:** real product, not MVP.  
**Reference:** Google Docs menu screenshots provided by user (2026-07-19).

---

## 1. Current State Audit

All claims below are verified against the current tree (`main @ 0be7e00`).

### 1.1 Already implemented and working

| Menu | Feature | Status |
|------|---------|--------|
| **File** | New, Open, Make a copy, Share, Download (8 formats), Rename, Move, Trash, Version history, Language, Page setup, Print | ✅ Working |
| **View** | Show sidebar, Focus mode, Ruler | ✅ Working |
| **Insert** | Image, Table, Code block, Header, Footer, Footnote, Templates (Meeting Notes, Email Draft) | ✅ Working |
| **Format** | Bold, Italic, Underline, Heading 1/2/3 | ✅ Working |
| **Tools** | Spell check, Word count, Preferences | ✅ Working |
| **Extensions** | Manage extensions | ✅ Working |
| **Help** | Keyboard shortcuts, Report issue, About | ✅ Working |
| **Sidebars** | TOC, Document Tabs, History (stub), Comments (stub), AI (stub) | ⚠️ Partially wired |

### 1.2 Missing or stubbed (Google Docs benchmark)

| Menu | Missing features |
|------|------------------|
| **Edit** | Undo, Redo, Cut, Copy, Paste, Paste without formatting, Select all, Delete, Find and replace |
| **Insert** | Link, Drawing, Chart, Symbols, Tab, Horizontal line, Break, Bookmark, Page elements, Comment |
| **Format** | Align & indent, Line & paragraph spacing, Columns, Bullets & numbering, Page numbers, Page orientation, Switch to Pageless, Clear formatting, Table formatting, Image formatting, Borders & lines |
| **Tools** | Proofread, Track changes, Compare documents, Citations, eSignature, Line numbers, Linked objects, Dictionary, Translate, Voice typing, Audio, Notification settings, Accessibility |
| **Extensions** | Add-ons, Apps Script, AI Assist, MathType, GPT, Table of contents |
| **Help** | Search menus, Docs Help, Training, Updates, Privacy Policy, Terms of Service |

---

## 2. Feature Prioritization

Features are prioritized by **value to users** and **effort to implement**. P0 = critical, P1 = high, P2 = medium, P3 = low.

### Phase 6: Core Editing (Q3 2026)

Goal: close the fundamental gap to be considered a serious document editor.

| Priority | Feature | Effort | Value | Notes |
|----------|---------|--------|-------|-------|
| **P0** | Find and replace | High | High | Core editing feature. Issue #26. |
| **P0** | Clear formatting | Low | High | Quick win. `editor.commands.clearNodes()` + `unsetAllMarks()`. |
| **P0** | Undo / Redo | Low | High | Already in menu, just wire to `editor.commands.undo()` / `redo()`. |
| **P1** | Align & indent | Low | High | Plugin exists in `packages/plugins/alignment.ts`. Wire to Format menu. |
| **P1** | Line & paragraph spacing | Medium | High | Need ProseMirror spacing plugin. |
| **P1** | Bullets & numbering | Low | High | Plugin exists in `packages/plugins/lists.ts`. Wire to Format menu. |
| **P1** | Link | Medium | High | Insert/edit hyperlink (⌘K). |
| **P2** | Page numbers | Low | Medium | Insert page number in header/footer. |
| **P2** | Pageless format | Medium | Medium | Toggle between paginated and continuous view. |
| **P2** | Horizontal line | Low | Medium | Insert horizontal rule. |
| **P2** | Bookmark | Medium | Medium | Internal document anchor link. |
| **P2** | Cut / Copy / Paste | Medium | High | Clipboard API with fallback. |
| **P2** | Paste without formatting | Low | Medium | Plain text paste. |
| **P2** | Delete | Low | Medium | Delete selection. |
| **P2** | Select all | Low | Medium | `editor.commands.selectAll()`. |

**Estimasi effort:** 4-6 minggu untuk 1-2 developer.

---

### Phase 7: Productivity (Q4 2026)

Goal: differentiate from basic editors with professional workflow features.

| Priority | Feature | Effort | Value | Notes |
|----------|---------|--------|-------|-------|
| **P0** | Track changes / Review suggested edits | High | High | Key for team collaboration. |
| **P0** | Proofread (grammar check) | High | High | Better than basic spell check. |
| **P1** | Compare documents | Medium | High | Diff between two versions. |
| **P1** | Citations | Medium | High | Manage citations and bibliography. |
| **P1** | Dictionary | Low | Medium | Built-in dictionary lookup. |
| **P2** | Line numbers | Low | Medium | Show line numbers in margin. |
| **P2** | Linked objects | High | Medium | Embed objects from other apps. |
| **P3** | Translate document | Medium | Low | Translate to other languages. |
| **P3** | Voice typing | High | Low | Speech-to-text input. |
| **P3** | Audio | Medium | Low | Insert audio player. |

**Estimasi effort:** 8-12 minggu untuk 1-2 developer. Track changes is the most complex.

---

### Phase 8: Collaboration (Q1 2027)

Goal: multi-user real-time collaboration features.

| Priority | Feature | Effort | Value | Notes |
|----------|---------|--------|-------|-------|
| **P0** | Comments | High | High | Async collaboration. Phase 9 already planned. |
| **P0** | Suggestions (track changes) | High | High | Suggesting mode. Phase 9 already planned. |
| **P1** | eSignature | High | Medium | Electronic signature. |
| **P1** | Smart chips | Medium | Medium | Mention, date, file chips. |
| **P2** | Notification settings | Medium | Medium | Email/push notification for changes. |
| **P2** | Accessibility | Medium | Medium | Screen reader, keyboard navigation. |

**Estimasi effort:** 8-12 minggu untuk 2-3 developer.

---

### Phase 9: AI & Extensions (Q2 2027)

Goal: unique differentiators vs competitors.

| Priority | Feature | Effort | Value | Notes |
|----------|---------|--------|-------|-------|
| **P0** | AI Assist | High | High | AI writing assistant (grammar, rewrite, summarize). |
| **P1** | Add-ons marketplace | High | Medium | Third-party extensions. |
| **P1** | Apps Script | High | Medium | Automation and custom workflow. |
| **P2** | MathType | Medium | Medium | Equation editor. |
| **P2** | Chart | Medium | Medium | Insert chart from data. |
| **P2** | Drawing | Medium | Medium | Freehand drawing canvas. |

**Estimasi effort:** 12+ minggu untuk 2-3 developer.

---

## 3. Recommended Immediate Work (Next 2-4 Weeks)

Based on the analysis, these are the most valuable features to implement now:

### 3.1 Quick Wins (Low effort, high value)

1. **Clear formatting** — `editor.commands.clearNodes()` + `unsetAllMarks()`. 1-2 days.
2. **Undo / Redo** — Already in menu, just wire to `editor.commands.undo()` / `redo()`. 1 day.
3. **Align & indent** — Plugin exists. Wire to Format menu. 2-3 days.
4. **Bullets & numbering** — Plugin exists. Wire to Format menu. 2-3 days.
5. **Horizontal line** — Insert horizontal rule. 1 day.
6. **Page numbers** — Insert page number in header/footer. 2-3 days.

### 3.2 Core Features (Medium effort, high value)

1. **Find and replace (EM-2)** — Issue #26. 1-2 weeks.
2. **Cut / Copy / Paste** — Clipboard API with fallback. 3-5 days.
3. **Link** — Insert/edit hyperlink (⌘K). 3-5 days.
4. **Pageless format** — Toggle between paginated and continuous view. 3-5 days.

### 3.3 Strategic Features (High effort, high value)

1. **Track changes / Review suggested edits** — Key differentiator. 2-4 weeks.
2. **Comments** — Async collaboration. 2-3 weeks.

---

## 4. What NOT to Implement Yet

These features are either too niche, too complex, or not aligned with current product goals:

| Feature | Reason to defer |
|---------|----------------|
| **eSignature** | Niche, requires third-party integration. |
| **Voice typing** | Complex, browser API not stable. |
| **Apps Script** | Requires sandboxing and serious security review. |
| **AI Assist** | Expensive, requires LLM integration and privacy review. |
| **MathType** | Niche, only for academic users. |
| **Drawing** | Complex canvas implementation, low usage. |

---

## 5. Implementation Strategy

### 5.1 Technical Approach

1. **Use existing plugins where possible.** The app already has plugins for alignment, lists, headings, links, images, tables, etc. We should wire them to the menu instead of reimplementing.
2. **Library owns the chrome, host owns the data.** Menu items should be handled internally by `DocsEditor.vue` when they are editor-specific (formatting, editing). Host apps should only handle data-specific actions (save, share, export).
3. **Keyboard shortcuts should be registered in the library.** `DocsEditor.vue` should register shortcuts for all menu items so they work consistently across host apps.

### 5.2 UI/UX Approach

1. **Menu items should show keyboard shortcuts.** Like Google Docs, show `⌘Z`, `⌘Y`, etc. in the menu.
2. **Disable menu items when not applicable.** E.g., Undo disabled when there's nothing to undo.
3. **Use sub-menus for grouped features.** E.g., Format → Text → Bold/Italic/Underline, Format → Paragraph styles → Heading 1/2/3.

### 5.3 Testing Approach

1. **Unit tests for each feature.** Test clipboard operations, formatting commands, search/replace logic.
2. **E2E tests for critical flows.** Test find and replace, formatting, page setup, export.
3. **Cross-browser testing.** Ensure clipboard and keyboard shortcuts work in Chrome, Firefox, Safari, Edge.

---

## 6. Open Questions for Product Review

1. **Track changes:** Should we implement full track changes (insertions, deletions, formatting) or just basic suggestions?
2. **Comments:** Should comments be anchored to text (like Google Docs) or to paragraphs (simpler)?
3. **AI Assist:** Should we integrate with a specific LLM (OpenAI, Anthropic) or build an abstraction layer?
4. **Pageless format:** Should this be a per-document setting or a global preference?
5. **Add-ons:** Should we build a marketplace or just allow custom extensions?

---

## 7. Related Plans

- [`phase-5-export-pdf-docx.md`](./phase-5-export-pdf-docx.md) — Export to PDF/DOCX
- [`phase-9-google-docs-parity.md`](./phase-9-google-docs-parity.md) — Google Docs parity features (comments, versioning, suggestions)
- [`file-menu-professionalization-plan.md`](./file-menu-professionalization-plan.md) — File menu features (FM-1 to FM-4)
- [`edit-menu-professionalization-plan.md`](./edit-menu-professionalization-plan.md) — Edit menu features (EM-1, EM-2)

---

*End of roadmap. Ready for review before implementation begins.*
