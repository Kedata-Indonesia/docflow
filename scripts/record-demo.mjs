#!/usr/bin/env node
/**
 * Records the README demo GIF from the local playground.
 *
 * Beats: sample document → scroll through paginated pages → type to trigger an
 * automatic page break → footer page counter updates → export the document.
 *
 * Prerequisites (the playground is a local-only harness, see `.gitignore`):
 *   pnpm playground:restore     # once, from a fresh clone
 *   pnpm build && pnpm dev      # serves http://localhost:5200
 *
 * Usage:
 *   node scripts/record-demo.mjs [outputPath]
 *
 * Playwright is not a repo dependency (CI never runs this), so the script
 * resolves it from the local install or the global npm root; override with
 * `PLAYWRIGHT_PATH=/abs/path/to/playwright/index.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_GIF = process.argv[2] ?? join(ROOT, 'docs/assets/docflow-demo.gif')
const APP_URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5200'
const VIDEO_DIR = join(ROOT, '.demo-recording')
const VIEWPORT = { width: 1440, height: 900 }

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) {
    return import(pathToFileURL(process.env.PLAYWRIGHT_PATH).href)
  }
  try {
    return await import('playwright')
  } catch {
    /* not a repo dependency — fall back to the global install */
  }
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const candidates = [
    join(globalRoot, '@playwright/mcp/node_modules/playwright/index.mjs'),
    join(globalRoot, 'playwright/index.mjs'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
  }
  throw new Error('Playwright not found — install it or set PLAYWRIGHT_PATH')
}

/** A short, deliberate pause so the recorded GIF stays readable. */
const beat = (page, ms) => page.waitForTimeout(ms)

/** The bundled browser may be missing; fall back to the system Chrome install. */
async function launchBrowser(chromium) {
  for (const options of [{ channel: 'chrome' }, {}]) {
    try {
      return await chromium.launch(options)
    } catch (error) {
      if (options.channel === undefined) throw error
    }
  }
}

async function recordDemo() {
  const { chromium } = await loadPlaywright()
  mkdirSync(VIDEO_DIR, { recursive: true })

  const browser = await launchBrowser(chromium)
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
    acceptDownloads: true,
  })
  const page = await context.newPage()

  // `load`, not `networkidle`: Vite's HMR websocket never lets the network idle.
  await page.goto(APP_URL, { waitUntil: 'load' })
  await page.locator('.ProseMirror').first().waitFor({ state: 'attached' })
  // The review panel and event log are playground chrome, not the library —
  // hide them before the first frame so the demo opens on the editor alone.
  await page.addStyleTag({ content: '.pg-panel, .pg-log { display: none !important; }' })
  await beat(page, 5500)
  // Header/footer surfaces are also `.ProseMirror`, so target the visible body.
  const editor = page.locator('.ProseMirror:visible').first()
  await beat(page, 800)

  // Scroll down through the paginated pages, then back to the top.
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 1200)
    await beat(page, 1000)
  }
  await beat(page, 2500)
  await page.mouse.wheel(0, -6000)
  await beat(page, 1800)

  // Type at the end of the document until the content overflows to a new page.
  await editor.click()
  await beat(page, 600)
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  const paragraph =
    'Melalui rapat ini kami berharap setiap unit menyiapkan bahan paparan ' +
    'dan data pendukung terbaru, sehingga keputusan triwulan IV dapat diambil ' +
    'secara cepat, terukur, dan tetap selaras dengan sasaran strategis ' +
    'organisasi sepanjang tahun anggaran berjalan.'
  await page.keyboard.type(paragraph, { delay: 60 })
  await beat(page, 3500)

  // Export: File → Download → Word, demonstrating DOCX export.
  await page.getByRole('button', { name: 'Berkas' }).click()
  await beat(page, 1000)
  await page.getByRole('button', { name: 'Unduh' }).hover()
  await beat(page, 2200)
  const docx = page.getByRole('button', { name: /word|docx/i }).first()
  if (await docx.count()) {
    const download = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
    await docx.click()
    await download
    await beat(page, 2500)
  }
  await beat(page, 2500)

  const video = page.video()
  await context.close()
  await browser.close()
  return video.path()
}

async function toGif(videoPath) {
  mkdirSync(dirname(OUT_GIF), { recursive: true })
  // Palette-based conversion keeps the GIF small enough for a README.
  const filter =
    'fps=12,scale=900:-1:flags=lanczos,split[s0][s1];' +
    '[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer'
  execFileSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-vf', filter, '-loop', '0', OUT_GIF],
    { stdio: 'inherit' },
  )
  return OUT_GIF
}

const videoPath = await recordDemo()
const gif = await toGif(videoPath)
console.log(`\nWrote ${gif}`)
