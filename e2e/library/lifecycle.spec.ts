import { test, expect } from '@playwright/test'

/**
 * Lifecycle e2e for issue #222: `e2e/showcase` drives the demo app, so nothing
 * there can unmount the editor without tearing the page down. These run against
 * `lifecycle.html`, a plain `createEditor()` harness in the playground.
 *
 * What this owns: mounting twice must not leave two editors, and teardown must
 * undo everything mounting registered on `document` — the leak that shows up in
 * a host as handlers firing twice after a remount, and that no page-level test
 * can see.
 */

type Harness = {
  mounts: number
  unmounts: number
  errors: string[]
  liveEditors: () => number
  netListeners: () => number
  listenerDelta: () => Record<string, number>
}

declare global {
  interface Window {
    __lifecycle?: Harness
  }
}

test.describe('editor lifecycle', () => {
  test('mount → unmount → mount keeps one editor and no leaked document listeners', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    await page.goto('/lifecycle.html')
    await expect(page.locator('#mount')).toBeVisible()
    await expect.poll(() => page.evaluate(() => Boolean(window.__lifecycle))).toBe(true)

    const baseline = await page.evaluate(() => window.__lifecycle!.netListeners())

    await page.click('#mount')
    await expect(page.locator('.ProseMirror')).toHaveCount(1)
    const firstMount = await page.evaluate(() => window.__lifecycle!.netListeners())

    await page.click('#unmount')
    await expect(page.locator('.ProseMirror')).toHaveCount(0)
    // Teardown must return `document` to its pre-mount state, not merely hide the DOM.
    await expect.poll(() => page.evaluate(() => window.__lifecycle!.netListeners())).toBe(baseline)

    await page.click('#mount')
    await expect(page.locator('.ProseMirror')).toHaveCount(1)
    const secondMount = await page.evaluate(() => window.__lifecycle!.netListeners())

    // Same number of document listeners as the first mount: nothing registered twice.
    expect(secondMount).toBe(firstMount)

    const harness = await page.evaluate(() => ({
      mounts: window.__lifecycle!.mounts,
      unmounts: window.__lifecycle!.unmounts,
      errors: window.__lifecycle!.errors,
    }))

    expect(harness.mounts).toBe(2)
    expect(harness.unmounts).toBe(1)
    expect(harness.errors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
})
