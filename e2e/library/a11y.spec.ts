import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Accessibility gate for issue #170 (phase 3).
 *
 * Scope is deliberately narrow: the audit in `docs/a11y-button-audit.md` owns
 * *names* on buttons, so this spec runs the ARIA rules that back that claim rather
 * than the whole WCAG set — a broad axe run would fail on contrast/landmark work
 * nobody has done yet and the gate would be turned off within a week.
 *
 * `button-name` is the rule the audit fixes; the two `aria-*` rules catch a state
 * attribute applied to the wrong element, which is what phase 3 adds.
 */

const RULES = ['button-name', 'aria-allowed-attr', 'aria-valid-attr-value']

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withRules(RULES).analyze()
  return results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
}

function report(violations: Awaited<ReturnType<typeof seriousViolations>>): string {
  return JSON.stringify(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
    })),
    null,
    2,
  )
}

test.describe('accessible names and ARIA state', () => {
  test('the demo editor has no serious/critical ARIA violations', async ({ page }) => {
    await page.goto('/')
    // The demo mounts more than one editor surface (main editor + panels), so the
    // check is "the editor is up", not an exact count.
    await expect(page.locator('.ProseMirror').first()).toBeVisible()

    const violations = await seriousViolations(page)
    expect(violations.length, report(violations)).toBe(0)
  })

  test('the lifecycle harness has no serious/critical ARIA violations', async ({ page }) => {
    await page.goto('/lifecycle.html')
    await page.click('#mount')
    await expect(page.locator('.ProseMirror')).toHaveCount(1)

    const violations = await seriousViolations(page)
    expect(violations.length, report(violations)).toBe(0)
  })
})
