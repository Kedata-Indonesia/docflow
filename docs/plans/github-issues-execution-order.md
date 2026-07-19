# Docflow GitHub Issues — Execution Order & Dependencies

**Purpose:** This document provides the recommended execution order for all open GitHub issues, based on technical dependencies and product priorities. Use this as a reference for sprint planning and developer assignment.

**Status:** draft for team review; not committed to code.  
**Last updated:** 2026-07-19

---

## 1. Issue Inventory

### Menu Features (Quick Wins & Core Editing)

| # | Title | Phase | Priority | Effort | Dependencies |
|---|-------|-------|----------|--------|--------------|
| #27 | feat(edit-menu): Quick Wins Bundle (Undo/Redo/Clear Formatting/Align/Bullets) | — | P0 | 1-2 days | None |
| #25 | feat(edit-menu): EM-1 Basic Editing Operations | — | P0 | 3-5 days | None |
| #26 | feat(edit-menu): EM-2 Find and Replace | — | P0 | 1-2 weeks | None |
| #28 | feat(edit-menu): Clipboard Operations (Cut/Copy/Paste/Paste without formatting/Delete) | — | P1 | 3-5 days | None |
| #29 | feat(insert-menu): Link Insertion and Editing (⌘K) | — | P1 | 3-5 days | None |
| #30 | feat(format-menu): Pageless Format Toggle | — | P2 | 3-5 days | None |

### Phase Plans (Foundation & Infrastructure)

| # | Title | Phase | Priority | Effort | Dependencies |
|---|-------|-------|----------|--------|--------------|
| #33 | feat(phase-0): Boundary Contract & Guardrails | Phase 0 | P0 | 1 week | None |
| #34 | feat(phase-1): Collaboration Persistence (Yjs Server-Authoritative) | Phase 1 | P0 | 2-3 weeks | None |
| #35 | feat(phase-2): Library Injection Points (Image Upload, Collab Defaults) | Phase 2 | P0 | 1-2 weeks | Phase 0 |
| #36 | feat(phase-3): apps/web Split (Product vs Library Showcase) | Phase 3 | P1 | 2-3 weeks | Phase 1, Phase 2 |
| #37 | feat(phase-4): Self-hosted Assets & Storage (S3/MinIO/GridFS) | Phase 4 | P1 | 2-3 weeks | Phase 2, Phase 3 (for wiring) |
| #38 | feat(phase-5): Export (PDF / DOCX) — Library Extraction & PM JSON Mapper | Phase 5 | P1 | 2-3 weeks | Phase 2 (partially done) |
| #39 | feat(phase-6): Citations & References (Chicago / CSL) | Phase 6 | P1 | 3-4 weeks | Phase 2, Phase 3, Phase 5 |
| #40 | feat(phase-7): AI Assistance (Pluggable LLM) | Phase 7 | P1 | 3-4 weeks | Phase 2, Phase 6 |
| #41 | feat(phase-8): On-prem Deployment Packaging (Docker Compose) | Phase 8 | P1 | 2-3 weeks | Phase 1, Phase 3, Phase 4, Phase 7 |

### Phase 9 (Google Docs Parity)

| # | Title | Phase | Priority | Effort | Dependencies |
|---|-------|-------|----------|--------|--------------|
| #42 | feat(phase-9): Google-Docs Feature Parity (Versioning, Comments, Roles, Offline) | Phase 9 | P2 | 8-12 weeks | Phase 1, Phase 3, roles |
| #31 | feat(tools-menu): Track Changes / Review Suggested Edits | Phase 9 (P9-8) | P2 | 2-4 weeks | Phase 1, roles |
| #32 | feat(insert-menu): Comments with Anchored Text | Phase 9 (P9-4) | P2 | 2-3 weeks | Phase 1, roles |

---

## 2. Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WAVE 1: FOUNDATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  #33 Phase 0: Boundary Contract ────────────┐                               │
│       (no dependencies)                     │                               │
│                                             ▼                               │
│  #34 Phase 1: Collab Persistence    #35 Phase 2: Library Injection Points   │
│       (no dependencies)                  (needs Phase 0)                    │
│       ◄────────────────────────────────────►                                │
│              (can be done in parallel)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WAVE 2: MENU FEATURES                               │
│                    (can be done anytime, independent)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  #27 Quick Wins Bundle          #25 EM-1 Basic Editing Operations           │
│  #26 EM-2 Find and Replace      #28 Clipboard Operations                    │
│  #29 Link Insertion             #30 Pageless Format                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WAVE 3: PRODUCT SPLIT                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  #36 Phase 3: apps/web Split                                                 │
│       (needs Phase 1 & 2)                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WAVE 4: INFRASTRUCTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  #37 Phase 4: Assets & Storage                                               │
│       (needs Phase 2, wiring needs Phase 3)                                  │
│                                                                             │
│  #38 Phase 5: Export Library Extraction                                      │
│       (substantially implemented, needs Phase 2 for images)                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WAVE 5: ADVANCED FEATURES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  #39 Phase 6: Citations                                                      │
│       (needs Phase 2, 3, 5)                                                  │
│                                                                             │
│  #40 Phase 7: AI Assistance                                                  │
│       (needs Phase 2, 6)                                                     │
│                                                                             │
│  #41 Phase 8: Deployment                                                     │
│       (needs Phase 1, 3, 4, 7)                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WAVE 6: COLLABORATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  #42 Phase 9: Google Docs Parity                                             │
│       (needs Phase 1, 3, roles)                                              │
│       ├── #32 Comments (P9-4)                                                │
│       └── #31 Track Changes (P9-8)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Recommended Execution Order

### Sprint 1-2 (Weeks 1-2): Foundation + Quick Wins

**Goal:** Establish architecture boundary and deliver quick wins to show progress.

| Order | Issue | Rationale |
|-------|-------|-----------|
| 1 | #33 Phase 0: Boundary Contract | Foundational for all other phases. No runtime changes, just docs + tooling. |
| 2 | #27 Quick Wins Bundle | Good first issue. Delivers visible value quickly. |
| 3 | #34 Phase 1: Collab Persistence | Already in progress. Core landed, needs completion. |
| 4 | #35 Phase 2: Library Injection Points | Depends on Phase 0. Needed for Phase 3, 4, 5, 6, 7. |

**Deliverable:** Architecture boundary documented, quick wins shipped, Phase 1 & 2 complete.

---

### Sprint 3-4 (Weeks 3-4): Core Editing + Product Split

**Goal:** Complete core editing features and split product from library showcase.

| Order | Issue | Rationale |
|-------|-------|-----------|
| 5 | #25 EM-1 Basic Editing Operations | Core editing features. No dependencies. |
| 6 | #26 EM-2 Find and Replace | Core editing feature. No dependencies. |
| 7 | #36 Phase 3: apps/web Split | Depends on Phase 1 & 2. Critical for production. |

**Deliverable:** Full Edit menu, apps/web split complete.

---

### Sprint 5-6 (Weeks 5-6): Infrastructure + Advanced Features

**Goal:** Add infrastructure and advanced features.

| Order | Issue | Rationale |
|-------|-------|-----------|
| 8 | #28 Clipboard Operations | Core editing feature. No dependencies. |
| 9 | #29 Link Insertion | Core editing feature. No dependencies. |
| 10 | #37 Phase 4: Assets & Storage | Needs Phase 2, wiring needs Phase 3. |
| 11 | #38 Phase 5: Export Library Extraction | Substantially implemented, needs Phase 2 for images. |

**Deliverable:** Clipboard, Link, Assets & Storage, Export library.

---

### Sprint 7-8 (Weeks 7-8): Advanced Features

**Goal:** Add citations and AI assistance.

| Order | Issue | Rationale |
|-------|-------|-----------|
| 12 | #30 Pageless Format | Format menu feature. No dependencies. |
| 13 | #39 Phase 6: Citations | Needs Phase 2, 3, 5. |
| 14 | #40 Phase 7: AI Assistance | Needs Phase 2, 6. |

**Deliverable:** Pageless format, Citations, AI Assistance.

---

### Sprint 9-10 (Weeks 9-10): Deployment + Collaboration

**Goal:** Deploy production and add collaboration features.

| Order | Issue | Rationale |
|-------|-------|-----------|
| 15 | #41 Phase 8: Deployment | Needs Phase 1, 3, 4, 7. |
| 16 | #42 Phase 9: Google Docs Parity | Needs Phase 1, 3, roles. |
| 17 | #32 Comments | Needs Phase 1, roles. Can be done with Phase 9. |
| 18 | #31 Track Changes | Needs Phase 1, roles. Can be done with Phase 9. |

**Deliverable:** Production deployment, Comments, Track Changes, Google Docs Parity.

---

## 4. Parallel Work Streams

Some issues can be worked on in parallel to speed up delivery:

### Stream A: Foundation (1 developer)
- #33 Phase 0 → #35 Phase 2

### Stream B: Menu Features (1 developer)
- #27 Quick Wins → #25 EM-1 → #26 EM-2 → #28 Clipboard → #29 Link → #30 Pageless

### Stream C: Collaboration (1 developer)
- #34 Phase 1 (already in progress)

### Stream D: Product Split (1 developer, after Stream A & C)
- #36 Phase 3

### Stream E: Infrastructure (1 developer, after Stream D)
- #37 Phase 4 → #38 Phase 5

### Stream F: Advanced Features (1 developer, after Stream E)
- #39 Phase 6 → #40 Phase 7 → #41 Phase 8

### Stream G: Collaboration Features (1 developer, after Stream C)
- #42 Phase 9 → #32 Comments → #31 Track Changes

---

## 5. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Phase 1 is in progress but not complete** | Assign dedicated developer to finish Phase 1 before starting Phase 3. |
| **Phase 2 depends on Phase 0** | Do Phase 0 first. It's documentation + tooling, quick to complete. |
| **Phase 9 is large (8-12 weeks)** | Break into sub-groups: P9-1 (TOC), P9-2 (Presence), P9-3 (Roles), P9-4 (Comments), P9-5 (Versioning), P9-6 (Templates), P9-7 (Offline), P9-8 (Suggestions). Ship incrementally. |
| **Track Changes and Comments need roles** | Implement roles (P9-3) first, then Comments (P9-4), then Track Changes (P9-8). |
| **Menu features are independent but many** | Assign to one developer to avoid context switching. Or split among multiple developers for faster delivery. |

---

## 6. Open Questions for Team Review

1. **Resource allocation:** How many developers are available for this roadmap?
2. **Timeline:** Is the 10-week timeline realistic, or should we adjust scope?
3. **Phase 9 scope:** Should we commit to all of Phase 9, or just the high-priority sub-groups (Roles, Comments, Versioning)?
4. **Track Changes vs Comments:** Which should be prioritized first?
5. **AI Assistance:** Is this a P1 or P2 for the product?
6. **Deployment:** Should we prioritize Phase 8 (Deployment) earlier to get production feedback?

---

## 7. Related Documents

- [`feature-enhancement-roadmap.md`](./feature-enhancement-roadmap.md) — Feature prioritization and rationale
- [`edit-menu-professionalization-plan.md`](./edit-menu-professionalization-plan.md) — Edit menu features (EM-1, EM-2)
- [`file-menu-professionalization-plan.md`](./file-menu-professionalization-plan.md) — File menu features (FM-1 to FM-4)
- [`phase-0-boundary-contract.md`](./phase-0-boundary-contract.md) — Phase 0 plan
- [`phase-1-collab-persistence.md`](./phase-1-collab-persistence.md) — Phase 1 plan
- [`phase-2-library-injection-points.md`](./phase-2-library-injection-points.md) — Phase 2 plan
- [`phase-3-apps-web-split.md`](./phase-3-apps-web-split.md) — Phase 3 plan
- [`phase-4-self-hosted-assets-storage.md`](./phase-4-self-hosted-assets-storage.md) — Phase 4 plan
- [`phase-5-export-pdf-docx.md`](./phase-5-export-pdf-docx.md) — Phase 5 plan
- [`phase-6-citations-references.md`](./phase-6-citations-references.md) — Phase 6 plan
- [`phase-7-ai-assistance.md`](./phase-7-ai-assistance.md) — Phase 7 plan
- [`phase-8-deployment-packaging.md`](./phase-8-deployment-packaging.md) — Phase 8 plan
- [`phase-9-google-docs-parity.md`](./phase-9-google-docs-parity.md) — Phase 9 plan

---

*End of document. Ready for team review and agreement.*
