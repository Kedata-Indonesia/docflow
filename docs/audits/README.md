# Audits — dated reviews

Reports in this folder are **snapshots**. They describe the tree at the commit named in
their header and are not edited afterwards: a later audit supersedes an earlier one. Work
is tracked in GitHub issues, not by rewriting the report. When a finding is fixed, the fix
lands with a `CHANGELOG` entry and the issue closes.

Use an audit to answer "what should we fix next?" and "why did we decide that?". Use the
[library contract](../reference/LIBRARY_CONTRACT.md) and the guides for how the product
behaves today.

## Index

| Date | Report | Scope | Findings |
|---|---|---|---|
| 2026-10-23 | [2026-10-23-audit-followup.md](./2026-10-23-audit-followup.md) | Re-audit at `67b76b0`: carried-over findings + new export/AI/a11y issues | 14 carried over, 5 new |
| 2026-10-22 | [2026-10-22-code-audit.md](./2026-10-22-code-audit.md) | Whole library (`packages/*`): correctness, safety, scale, tests, speed, lean | 14 (3 must fix) |
| 2026-10-20 | [2026-10-20-a11y-button-audit.md](./2026-10-20-a11y-button-audit.md) | Accessible names of toolbar buttons (issue #170) | — |

## Adding an audit

1. Name the file `YYYY-MM-DD-<scope>.md`.
2. Put the commit, date, reviewer, and the load you assumed in the header.
3. Number findings across severity groups so a reader can say "fix 2 and 5".
4. Every finding needs a concrete failure case, a smallest fix, and what happens if it is
   skipped. No style opinions, no "consider".
5. Add a row to the table above. Do not edit older reports.

The audit skill this folder was seeded from is `ponytail-audit`; the output contract it
follows is: correct → safe → holds under load → tested → fast → lean.
