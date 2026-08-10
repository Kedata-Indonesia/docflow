# Plan: Fix Table Column Resize (#55, #116)

- **#55** — Table column resize handle tidak muncul / tidak bisa drag (tables created via paste). Cursor becomes `col-resize` at the column edge, but drag does nothing. Reporter saw `handleCount: 0`. *(bug, high effort / medium impact — OPEN)*
- **#116** — Column resize terkunci/gagal saat batas kanan tabel menyentuh marjin maksimum. Internal column borders cannot be dragged when the table already fills the full page width. *(medium effort / medium impact — OPEN)*

Both issues trace to the **custom `ManualColumnResize` ProseMirror plugin** in `packages/core/src/Editor.ts`. The native `prosemirror-tables` column-resizing is intentionally **disabled** (`packages/plugins/src/table.ts:140` → `resizable: false`), and a hand-rolled mouse handler (`Editor.ts:290-642`) replaces it.

---

## 1. Root Cause Analysis

### 1.1 #116 — locked resize at full width (active bug)

The resize logic uses a **single-column model**: dragging column N's border only ever changes column N's width. There is no redistribution to the neighbor.

The clamp is computed at `packages/core/src/Editor.ts:362-373`:

```js
const startW = allColWidths[targetColIdx] || initialWidth(table, targetColIdx)

const maxContainerW = getMaxContainerWidth(table)
let otherColsW = 0
allColWidths.forEach((w, idx) => { if (idx !== targetColIdx) otherColsW += w })
const maxNw = Math.max(20, maxContainerW - otherColsW)
```

…and applied during the drag at `Editor.ts:407`:

```js
const nw = Math.min(maxNw, Math.max(20, startW + diff))
```

…and `updateDOMWidths` (`Editor.ts:376-394`) mutates **only** the target column.

**Failure mode.** When the table already fills the page, `sum(allColWidths) ≈ maxContainerW`, so `otherColsW = maxContainerW − startW`, and therefore:

```
maxNw = maxContainerW − otherColsW = maxContainerW − (maxContainerW − startW) = startW
```

The dragged column can **never exceed `startW`**, so dragging to the right is a no-op → the handle appears "locked." Dragging left only shrinks column N and leaves a gap on the right (no neighbor grows to compensate). This is exactly the report: *"tidak dapat memperkecil satu kolom untuk memperbesar kolom lainnya."*

**The fix must make internal-border drags redistributive** (Google Docs / Word behavior): growing column N by Δ shrinks column N+1 by Δ, total width constant.

### 1.2 #55 — missing handle / dead drag on pasted tables (largely stale, residual gaps)

- The reporter's `handleCount: 0` check counts `.column-resize-handle` elements, which belong to the **native** `columnResizing` plugin. That plugin is **off by design** (`table.ts:140`). The custom extension instead renders a hover cyan line (`.docflow-active-border-line`, `Editor.ts:512-555`) plus CSS cursor zones (`packages/vue/src/styles/index.css:401-426`). So "handle missing" is the expected state, not a defect.
- The original "drag does nothing" was most likely resolved when the custom extension shipped in **PR #61** (commit `9fd20ad`). The issue is still open and unverified — its only comment is *"iki uwis durun pak?"* ("is this done yet?").
- **Residual real gaps** the plan must close:
  1. **colspan indexing.** `Editor.ts:334` computes the column index from raw DOM child position: `Array.from(parent.children).indexOf(td)`. For pasted tables containing merged cells (`colspan > 1`), DOM index ≠ logical column index, so widths get assigned to the wrong column and a drag can target the wrong border.
  2. **duplicate cursor indicators.** `index.css:363-380` ships dead `.col-resize-active` / `::after` styles for the disabled native handle, and `index.css:402-426` adds `::after`/`::before` cursor zones that **overlap** the JS hover line, causing the double-cursor / flicker users see on wide pasted tables.

---

## 2. Implementation Plan

> **Invariant (AGENTS.md):** ProseMirror state is the single source of truth — mutate via transactions, let layout/collab react. No new schema; `colwidth` already exists on `tableCell`/`tableHeader` (`packages/plugins/src/table.ts:67-135`). Because widths persist via `tr.setNodeMarkup` (`Editor.ts:471`), collab (Yjs) propagates them automatically.

### Phase 1 — Redistributive resize (fixes #116)

**File:** `packages/core/src/Editor.ts`, inside `ManualColumnResize` → `addProseMirrorPlugins` → `view(view)` → `onMouseDown`.

**Step 1.1 — Classify the border being dragged.**
After computing `targetColIdx` (already done at `Editor.ts:342-349`), derive the resize mode:

```js
// targetColIdx already = the column whose RIGHT border is under the cursor
//   (left-border hits are already remapped to the previous column at line 345).
const totalCols = allColWidths.length
const isLastCol = targetColIdx === totalCols - 1
const neighborIdx = targetColIdx + 1          // column that will absorb the delta
const startNeighborW = !isLastCol ? (allColWidths[neighborIdx] || initialWidth(table, neighborIdx)) : 0
```

**Step 1.2 — Replace the clamp (`Editor.ts:366-373`).**
Keep `maxContainerW` only for the last-column (total-width) case. For internal borders, total width is constant, so no container clamp is needed:

```js
const maxContainerW = getMaxContainerWidth(table)
// only meaningful for isLastCol
let otherColsW = 0
allColWidths.forEach((w, idx) => { if (idx !== targetColIdx) otherColsW += w })
const maxNwLastCol = Math.max(20, maxContainerW - otherColsW)
```

**Step 1.3 — Rewrite `onMove` (`Editor.ts:403-421`).**
Compute `delta` once and apply it to the target + neighbor (or just the target for the last column):

```js
const onMove = function (e: MouseEvent) {
  moveCount++
  if (!e.buttons) { onUp(e); return }
  const rawDiff = e.clientX - startX

  if (isLastCol) {
    // total-width resize: only the dragged column changes, clamped to the page
    const nw = Math.min(maxNwLastCol, Math.max(20, startW + rawDiff))
    allColWidths[targetColIdx] = nw
    lastNw = nw
  } else {
    // redistributive: clamp delta so NEITHER column drops below 20px
    const delta = Math.min(rawDiff, startNeighborW - 20)     // can't shrink neighbor below 20
                  // (negative delta = grow neighbor; lower bound keeps target ≥ 20:)
    const clampedDelta = Math.max(delta, 20 - startW)
    allColWidths[targetColIdx]   = startW + clampedDelta
    allColWidths[neighborIdx]    = startNeighborW - clampedDelta
    lastNw = allColWidths[targetColIdx]
  }

  // Live cyan line at the dragged border
  let borderPos = table.getBoundingClientRect().left
  for (let i = 0; i <= targetColIdx; i++) borderPos += allColWidths[i]
  showLine(table, borderPos)

  pauseObserver()
  updateDOMWidths()          // see Step 1.4 — now writes ALL columns
  resumeObserver()
}
```

> Note: the lower clamp `20 - startW` allows the target column to shrink toward 20px (negative delta) while the neighbor grows by the same amount — total width stays constant, so the table never overflows the page even when it started at full width. This is the precise behavior #116 requires.

**Step 1.4 — Generalize `updateDOMWidths` (`Editor.ts:376-394`).**
Drop the `(targetIdx, targetW)` parameters; it should always rewrite every column from `allColWidths` (it nearly does already). Keep the `<col>`, `<td>`, and `<table>` width writes. Clamp the table width to `maxContainerW` only for the last-column case; otherwise the sum is unchanged.

**Step 1.5 — `onUp` already persists all columns** (`Editor.ts:462-475` walks every row/cell and writes `colwidth` from `allColWidths`). No change needed there beyond removing the stray `console.log` at `Editor.ts:432`.

### Phase 2 — Pasted-table hardening + CSS cleanup (closes #55)

**Step 2.1 — Logical column index for colspan** (`Editor.ts:334`).
Replace DOM-child indexing with a colspan-aware calculation:

```js
function logicalColIndex(td: HTMLElement, row: HTMLElement): number {
  let idx = 0
  for (const sibling of Array.from(row.children)) {
    if (sibling === td) return idx
    idx += parseInt((sibling as HTMLElement).colSpan || '1', 10)
  }
  return idx
}
// usage:
const colIdx = logicalColIndex(td, parent)
```

Also update `initialWidth` (`Editor.ts:500-506`) and the `colsList`/`allColWidths` build (`Editor.ts:352-359`) to read from `colgroup col` first (already does) and to respect colspan when mapping a cell's `colwidth` array to `allColWidths` slots.

**Step 2.2 — CSS cleanup** (`packages/vue/src/styles/index.css`):
1. Delete the dead native-handle block `index.css:363-380` (`.col-resize-active`, `::after`) **and** the dead `.ProseMirror.resize-cursor` rule — both reference classes the disabled native resizer would add; they are never applied. *(Implemented.)*
2. Keep the `::after`/`::before` cursor zones at `index.css:401-426` — they are the CSS-only `col-resize` cursor source and are **complementary** (not conflicting) with the JS cyan line (`showLine`/`hideLine`), which only sets `document.body`/`view.dom` cursor on hover. Removing them was considered and rejected: doing so would make the cursor depend solely on JS `mousemove` firing. *(Decision: keep both.)*

**Step 2.3 — Update issue #55** with the finding (native handle intentionally absent; drag restored by #61; colspan + CSS gaps fixed here) and close it after the Phase 3 regression test passes.

### Phase 3 — Tests

Two layers: a jsdom **unit test** (fast, deterministic, covers the math) and a **Playwright e2e** (covers the real DOM drag + visual handle). Both follow existing repo patterns (`packages/core/src/__tests__/Editor.test.ts`, `e2e/showcase/page-break.spec.ts`).

#### 3A. Unit test — `packages/plugins/src/__tests__/tableResize.test.ts`

> Run: `pnpm --filter @kedata-indonesia/docflow-plugins test:unit -- src/__tests__/tableResize.test.ts`
> jsdom dispatches real `MouseEvent`s; the extension's `document`-level `mousemove`/`mouseup` listeners fire normally.
>
> **Implementation note:** the test lives in `packages/plugins`, not `packages/core`, because `core` does **not** depend on `plugins` (dependency flow is `plugins → core`). The table extensions (`@tiptap/extension-table*`) and `tablePlugin` are only resolvable from the plugins package. happy-dom returns zeros for layout, so the test asserts *direction* (grew/shrank/total-constant) and derives `clientX` from the cell's own bounding rect — both hold regardless of whether `<col>` widths render explicitly or fall back to the 100px default. After any `Editor.ts` change, rebuild core first (`pnpm --filter @kedata-indonesia/docflow-core build`) — the plugins tests import the built dist.

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createEditor } from '../Editor.js'
import { tablePlugin } from '@kedata-indonesia/docflow-plugins'

describe('ManualColumnResize', () => {
  let target: HTMLDivElement
  let editor: ReturnType<typeof createEditor>

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    // wide host so getMaxContainerWidth() is generous
    Object.defineProperty(target, 'clientWidth', { value: 1000, configurable: true })
  })
  afterEach(() => { editor?.destroy(); target.remove() })

  function firstCell() { return target.querySelector('table td') as HTMLElement }
  function colWidths() {
    return Array.from(target.querySelectorAll('table colgroup col')).map(
      (c) => parseFloat((c as HTMLElement).style.width) || 0,
    )
  }

  it('redistributes width between adjacent columns (does not lock at full width)', () => {
    // 2-col table whose total already equals the container → the #116 scenario
    editor = createEditor({
      target,
      plugins: [tablePlugin()],
      content: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colwidth: [500] }, content: [{ type: 'paragraph' }] },
              { type: 'tableCell', attrs: { colwidth: [500] }, content: [{ type: 'paragraph' }] },
            ],
          }],
        }],
      },
    })

    const before = colWidths()
    expect(before[0] + before[1]).toBeGreaterThanOrEqual(999) // ~full width

    // Right border of column 0 is at x = before[0]
    const cell0 = firstCell()
    const startX = before[0]
    cell0.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: 10, bubbles: true, button: 0 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 80, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX + 80, bubbles: true }))

    const after = colWidths()
    expect(after[0]).toBeGreaterThan(before[0])             // col 0 grew ~80px
    expect(after[1]).toBeLessThan(before[1])                // col 1 shrank ~80px
    expect(Math.round(after[0] + after[1])).toBeCloseTo(Math.round(before[0] + before[1]), -1) // total ~constant
  })

  it('respects 20px minimum on the shrinking neighbor', () => {
    // neighbor starts at 40px; dragging +100px must stop when neighbor hits 20
    editor = createEditor({
      target,
      plugins: [tablePlugin()],
      content: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colwidth: [960] }, content: [{ type: 'paragraph' }] },
              { type: 'tableCell', attrs: { colwidth: [40] }, content: [{ type: 'paragraph' }] },
            ],
          }],
        }],
      },
    })
    const cell0 = firstCell()
    const startX = 960
    cell0.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: 10, bubbles: true, button: 0 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 100, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX + 100, bubbles: true }))

    const after = colWidths()
    expect(after[1]).toBeGreaterThanOrEqual(19)  // clamped at ~20
    expect(after[0]).toBeLessThanOrEqual(981)    // grew only by the allowed delta
  })

  it('persists redistributed widths into the ProseMirror doc', () => {
    editor = createEditor({
      target,
      plugins: [tablePlugin()],
      content: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colwidth: [300] }, content: [{ type: 'paragraph' }] },
              { type: 'tableCell', attrs: { colwidth: [300] }, content: [{ type: 'paragraph' }] },
            ],
          }],
        }],
      },
    })
    const cell0 = firstCell()
    cell0.dispatchEvent(new MouseEvent('mousedown', { clientX: 300, clientY: 10, bubbles: true, button: 0 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 360, bubbles: true }))

    let persisted: number[] = []
    editor.editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell') persisted = node.attrs.colwidth
      return node.type.name !== 'tableCell'
    })
    expect(persisted[0]).toBeGreaterThan(300)
  })
})
```

> Check `createEditor`'s `plugins` option signature in `packages/core/src/Editor.ts` before finalizing — if plugins are passed differently (e.g. via `.use()`), mirror the `Editor.test.ts:53-60` pattern (`editor.use(tablePlugin())`).

#### 3B. Playwright e2e — `e2e/showcase/table-resize.spec.ts`

> Run: `pnpm exec playwright test e2e/showcase/table-resize.spec.ts` (project `showcase`, auto-starts `apps/demo`).
> Real Chromium drag via `page.mouse` — exercises the actual DOM listeners, the cyan line, and the post-drag repaint.

```ts
import { test, expect, type Page } from '@playwright/test'

// apps/demo does not currently expose window.__docsEditor (only apps/web does).
// Insert the table through the toolbar UI so the test matches a real user flow.
async function insertTable(page: Page, cols = 3): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /Blank document/i }).first().click()
  await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()
  // Focus the paper, then trigger the Insert > Table toolbar action.
  await page.locator('.docs-editor__paper .ProseMirror').click()
  await page.getByRole('button', { name: /Insert Table/i }).click()
  await page.waitForTimeout(200)
}

async function colWidths(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.ProseMirror table colgroup col')).map(
      (c) => parseFloat((c as HTMLElement).style.width) || 0,
    ),
  )
}

test.describe('Table column resize', () => {
  test('#116 redistributes width when table fills the page', async ({ page }) => {
    await insertTable(page, 3)

    // Force the table to span the full paper width (equal columns) so we are in
    // the "right edge at maximum margin" state from the bug report.
    await page.evaluate(() => {
      const table = document.querySelector('.ProseMirror table') as HTMLElement
      const paper = document.querySelector('.docs-editor__paper') as HTMLElement
      const total = paper.clientWidth
      const per = Math.floor(total / 3)
      table.querySelectorAll('colgroup col').forEach((c, i) => {
        ;(c as HTMLElement).style.setProperty('width', `${per * (i === 2 ? 1 : 1)}px`, 'important')
      })
    })

    const before = await colWidths(page)

    // The internal border between col 0 and col 1 sits at x = tableLeft + before[0]
    const tableBox = await page.locator('.ProseMirror table').boundingBox()
    expect(tableBox).not.toBeNull()
    const borderX = tableBox!.x + before[0]
    const y = tableBox!.y + tableBox!.height / 2

    // Hover → cyan indicator should appear
    await page.mouse.move(borderX, y)
    await expect(page.locator('.docflow-active-border-line')).toBeVisible()

    // Drag the border 60px to the right
    await page.mouse.move(borderX, y)
    await page.mouse.down()
    await page.mouse.move(borderX + 60, y, { steps: 10 })
    await page.mouse.up()

    const after = await colWidths(page)
    expect(after[0]).toBeGreaterThan(before[0])                  // col 0 grew
    expect(after[1]).toBeLessThan(before[1])                     // col 1 shrank
    expect(Math.round(after[0] + after[1] + after[2]))
      .toBeCloseTo(Math.round(before[0] + before[1] + before[2]), -1) // total unchanged
  })

  test('#55 resize works on a pasted Google Docs table (incl. colspan)', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Blank document/i }).first().click()
    await expect(page.locator('.docs-editor__paper .ProseMirror')).toBeVisible()

    // Simulate a Google Docs clipboard: a table whose first row has a merged cell.
    const gdocsHtml = `
      <table>
        <colgroup><col style="width:200px"><col style="width:200px"><col style="width:200px"></colgroup>
        <tbody>
          <tr><td colspan="2">merged</td><td>c</td></tr>
          <tr><td>a</td><td>b</td><td>c</td></tr>
        </tbody>
      </table>`

    await page.evaluate((html) => {
      // Use the DataTransfer clipboard API to exercise the real paste path
      const dt = new DataTransfer()
      dt.setData('text/html', html)
      document.querySelector('.ProseMirror')!.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt as unknown as DataTransfer, bubbles: true }),
      )
    }, gdocsHtml)
    await page.waitForTimeout(200)

    await expect(page.locator('.ProseMirror table')).toBeVisible()

    const before = await colWidths(page)
    const tableBox = await page.locator('.ProseMirror table').boundingBox()
    const borderX = tableBox!.x + before[0]
    const y = tableBox!.y + tableBox!.height / 2

    await page.mouse.move(borderX, y)
    await page.mouse.down()
    await page.mouse.move(borderX + 40, y, { steps: 8 })
    await page.mouse.up()

    const after = await colWidths(page)
    expect(after[0]).not.toEqual(before[0])     // drag had an effect
    expect(after.some((w) => w > 0)).toBeTruthy()
  })

  test('last-column drag resizes total table width and never overflows the page', async ({ page }) => {
    await insertTable(page, 3)
    const before = await colWidths(page)
    const tableBox = await page.locator('.ProseMirror table').boundingBox()
    // Right border of the LAST column
    const borderX = tableBox!.x + before.slice(0, -1).reduce((a, b) => a + b, 0) + before[before.length - 1] - 2
    const y = tableBox!.y + tableBox!.height / 2

    await page.mouse.move(borderX, y)
    await page.mouse.down()
    // Drag way past the right paper edge
    await page.mouse.move(borderX + 400, y, { steps: 10 })
    await page.mouse.up()

    const tableAfter = await page.locator('.ProseMirror table').boundingBox()
    const paper = await page.locator('.docs-editor__paper').boundingBox()
    expect(tableAfter!.x + tableAfter!.width).toBeLessThanOrEqual(paper!.x + paper!.width + 1)
  })
})
```

> **Note on `window.__docsEditor`:** the existing `e2e/showcase/page-break.spec.ts` reads `window.__docsEditor`, but `apps/demo` does **not** currently expose it (only `apps/web/src/components/EditorView.vue:1425` does). Prefer the **toolbar-driven** insertion shown above. If you want to use `insertContent` programmatically instead, first expose the instance in `apps/demo/src/components/EditorView.vue#handleEditorReady` (one line: `(window as any).__docsEditor = docsEditor.editor`) and mirror the `page-break.spec.ts` helper.

### Phase 4 — Verification gate (required order, per AGENTS.md)

After any non-trivial change, run scoped to the touched packages:

```bash
pnpm lint
pnpm typecheck
pnpm --filter @kedata-indonesia/docflow-core test:unit -- src/__tests__/TableResize.test.ts
pnpm --filter @kedata-indonesia/docflow-vue typecheck
pnpm exec playwright test e2e/showcase/table-resize.spec.ts   # editor UI changed → required
pnpm --filter @kedata-indonesia/docflow-core build
```

Watch-outs:
- `noUnusedLocals` / `noUnusedParameters` are on — remove the `console.log` at `Editor.ts:432` and any newly-unused binding (e.g. `isLastCol`, `moveCount` if you drop it).
- If you keep `updateDOMWidths(targetIdx, targetW)` signature but no longer use `targetIdx` inside, typecheck will fail — prefer the parameter-less rewrite in Step 1.4.

---

## 3. Manual Test Checklist (run in `pnpm dev` → apps/demo)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Insert 3×3 table; drag internal border right while table = full width | Col grows, neighbor shrinks, total constant (**#116**) |
| 2 | Same, drag left | Col shrinks, neighbor grows |
| 3 | Drag the **rightmost** border past the page edge | Table width clamps at paper right margin, never overflows |
| 4 | Drag until a column would go < 20px | Stops at ~20px; neighbor stops growing |
| 5 | Paste a 3×3 table from **Google Docs**; drag an internal border | Resize works (**#55**) |
| 6 | Paste a table with a `colspan` merged cell; drag border | Correct logical column resizes; no mis-assignment |
| 7 | Hover an internal border | Single cyan line + `col-resize` cursor; no double/flicker |
| 8 | Resize, then type in a cell, then reload the doc | Widths persist (ProseMirror `colwidth` round-trip) |
| 9 | Two clients in collab; client A resizes | Client B sees the resize via Yjs |

---

## 4. Out of Scope / Notes

- **Do not re-enable native `columnResizing()`** from `prosemirror-tables`. AGENTS.md's extension-collision invariant + #55's debugging notes show it conflicts with `PaginationPlus`. Keep the custom extension; only fix its math + indexing.
- **No schema change.** `colwidth` already exists on `tableCell`/`tableHeader` (`table.ts:67-135`); Phase 1 reuses the existing `setNodeMarkup` transaction at `Editor.ts:471`.
- **Collab:** because widths persist via ProseMirror transaction, Yjs propagates automatically. Add a collab smoke check (item 9) only if time permits — no code change expected.
- `packages/plugins/src/table.ts:140` stays `resizable: false`.
