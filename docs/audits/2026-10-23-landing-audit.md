# Audit Report — docflow-landing

**Run:** 2026-10-23 · **Commit:** `docflow-landing@3bf75e3` (main) · **Platform:** gh · **Scope:** whole repo (Nuxt 4 static single-page site)
**Standard used:** WCAG 2.2 AA, Core Web Vitals (p75 targets), Google search/social metadata, OWASP secure-headers baseline, tasteskill v2 house gates (`design-taste-frontend`).
**Mirrored from:** `Kedata-Indonesia/docflow-landing`, file `AUDIT_REPORT.md` (private repo). Paths and issue numbers in this report belong to that repo — every `#NN` below means `docflow-landing#NN`, never an issue in this one.
**Reviewer:** the landing repo's audit run, `ponytail-audit`.
**Load assumed:** one static page, one visitor per tab; 390 px mobile and 1440 px desktop viewports.
**Status:** snapshot of `docflow-landing`, not of this tree. Track the work in that repo's issues; do not edit this report after merge.

## 1. Scope & policy

| Item | Value |
|---|---|
| Severity threshold | file P1–P2; P3 stays in the watch list |
| Confidence floor | certain / likely (every finding has a `file:line` or a live HTTP response) |
| Issue cap | 12 |
| Labels | `bug`, `a11y`, `performance`, `seo`, `security`, `tech-debt`, `enhancement` |
| Already tracked | `docflow-landing#23` (landing redesign tracker) owns all pure house-style gate failures |

## 2. Scanners run

| Scanner | Command | Result |
|---|---|---|
| Build | `pnpm generate` | pass, 34 requests / 849 KiB |
| Typecheck | `pnpm typecheck` | **fail** (exit 1, `golar` not installed) |
| Lint | `pnpm lint` | **fail** (exit 2, ESLint 9 flat-config missing) |
| Lighthouse 12 (mobile, throttled) | `lighthouse --only-categories=…` | perf **71** · a11y **98** · best-practices **100** · SEO **100** |
| Lighthouse 12 (desktop) | `--preset=desktop` | perf **98** · a11y **98** · best-practices **100** · SEO **100** |
| tasteskill `lint.mjs` (source) | `node …/scripts/lint.mjs app` | **23 FAIL / 4 WARN** (was 37/6 on 2026-10-14) |
| tasteskill `inspect.mjs` (1440/768/390) | against the built site | **6 FAIL / 5 WARN** (was 12/4) |
| Live prod check | `curl -D-` on `docflow.kedata.cloud` | headers, soft-404 and asset weight below |

## 3. Findings

> **Correction, applied after the fix (2026-10-23):** F4's "mobile FCP 4.4 s / LCP 5.0 s / 1,200 ms
> render-blocking" was measured against the throwaway Python server, which sends uncompressed bytes.
> On the production image (nginx, gzip) the same page measured **FCP 2.40 s / LCP 3.80 s** before the
> change. The render-blocking third-party stylesheet was real; the size of its cost was overstated.
> See the PR for `docflow-landing#34` for the before/after numbers on identical servers.

| ID | Category | Sev | Conf | Evidence | Impact | Fix |
|----|----------|-----|------|----------|--------|-----|
| F1 | a11y | P1 | certain | `app/components/GithubStars.vue:13` `aria-label="GitHub"`, visible label `10` | axe `label-content-name-mismatch` (WCAG 2.5.3, serious): voice control says "GitHub", user sees "10" | `aria-label="GitHub stars: 10"` or drop the label and let the text name it |
| F2 | a11y | P1 | certain | `app/components/hero/PaperStack.vue:149` and `:191` — `role="tabpanel"` on `<article>` | axe `aria-allowed-role`; role ignored or mis-announced by AT | use `<div role="tabpanel">` (or `<section>`), keep `aria-labelledby` |
| F3 | a11y | P2 | certain | `app/components/Footer.vue:20,30,39` — `<h4>` directly under the last `<h2>` | axe `heading-order`; screen-reader outline skips a level | make them `<h3>` (or `<h2>` sized small) |
| F4 | performance | P1 | certain | `nuxt.config.ts:34` — one render-blocking `fonts.googleapis.com` stylesheet, 3 families / 5 faces | Mobile FCP 4.4 s, LCP 5.0 s, TTI 7.1 s; LCP element is the hero `<p>` waiting on the webfont; 1,200 ms render-blocking | self-host subsetted woff2 in `public/fonts`, `preload` the two used weights, drop Lora/JetBrains weights that are not on screen |
| F5 | performance | P2 | certain | `public/logo-colored.png` 1084×240, **87,995 B**, displayed at 32 px (`Navbar.vue:47`) and 28 px (`Footer.vue:12`); both light+dark files requested | 88 KB for a wordmark, PNG not in a modern format; `uses-responsive-images` / `modern-image-formats` savings 12 / 66 KB | ship SVG (or 2× AVIF/WebP), add `width`/`height`, load only the active variant |
| F6 | seo | P1 | certain | `nginx.conf:17` `try_files $uri $uri/ $uri.html /index.html` — prod `/nonexistent-xyz` and `/docs` both answer **200** with the home HTML (94 KB) | soft 404: unlimited duplicate URLs, no real 404 for visitors or crawlers; the generated `404.html` is unreachable | `try_files $uri $uri/ $uri.html =404;` + `error_page 404 /404.html;` (or a Nitro/Cloudflare rule) |
| F7 | seo | P2 | certain | `nuxt.config.ts:23-27` — `og:image` is a **relative** path to the 4.5:1 transparent logo; no `og:url`, `og:site_name`, `og:locale`, `twitter:image`, `<link rel="canonical">`, JSON-LD | link previews letterbox or show a transparent mark; no canonical; no `SoftwareApplication` rich result | absolute `https://docflow.kedata.cloud/og.png` at 1200×630 with a solid ground, add the missing tags + JSON-LD `SoftwareApplication`/`Organization` |
| F8 | seo | P2 | likely | `app/composables/useI18n.ts` — locale is a `localStorage` toggle only; no `?lang=`/path, no `hreflang`, `meta description` stays English | the whole Indonesian translation is invisible to search engines and to a shared link | expose `/id` (or `?lang=id`) as a prerendered route + `hreflang` alternates; keep the toggle as a redirect |
| F9 | security | P1 | certain | live headers: no `content-security-policy`, `strict-transport-security`, `x-content-type-options`, `referrer-policy`, `permissions-policy`; `nginx.conf` adds only `Cache-Control` for `/_nuxt/` | no defence-in-depth against XSS/clickjacking/downgrade; baseline check for any public site | add the five headers in `nginx.conf` (or a Cloudflare rule); CSP needs a hash/nonce for the inline theme script in `app/app.vue` |
| F10 | security | P2 | certain | `nuxt.config.ts:11` loads GA4 in every production build; Lighthouse third-party = **GTM 181 KB** + a `stats.g.doubleclick.net` ad-signals ping; no consent UI; footer (`Footer.vue:41-55`) has no privacy/terms link | ePrivacy/GDPR exposure for EU visitors (analytics + ad signals before consent); no notice for a page that collects data | gate gtag behind consent (or `analytics_storage: denied` until opt-in), add a privacy notice link next to the copyright |
| F11 | tech-debt | P1 | certain | no `.github/workflows/`; `pnpm lint` exits 2 (ESLint 9 flat config, `eslint` not in `devDependencies`); `pnpm typecheck` exits 1 (`golar` not installed) | both quality scripts are decorative: nothing stops a broken build from reaching `docflow.kedata.cloud` | add a CI workflow (`pnpm install`, `generate`, `typecheck`, lint, plus the taste gate script) or delete the dead scripts; this is the repo's only merge gate |
| F12 | enhancement | P2 | likely | hero (`Hero.vue:21-35`) sells "public beta launches in 11d 9h" while the primary CTA is "Try the live editor · no signup needed" | two contradicting availability claims on the first screen; the strongest fact (page-true footnotes) is in the sub-headline, not the H1 | say what launches (cloud pricing? the hosted app?) and keep one dominant CTA — header CTA secondary |

### Positives measured (do not regress)

- Lighthouse **SEO 100**, **best-practices 100**, **a11y 98**; CLS **0** and TBT 10 ms.
- Contrast failures from the landing repo's `DESIGN-AUDIT.md` are gone; em dashes are 0 in `app/` and in the build.
- i18n key parity EN/ID **253/253**; hero headline 1 line at 1440/768, 2 lines at 390.
- Tablist in `PaperStack` and `HowItWorks` has real `aria-selected`, roving `tabindex` and arrow-key handling; reduced motion is honoured; skip link + `<main>` landmark present.
- Bundle is sane: entry CSS 7.1 KB br, JS ~101 KB br, HTML 14.6 KB br.

## 4. Already tracked (not filed)

| Finding | Existing issue |
|---|---|
| 17 hairlines, 24 outlined boxes, 5 resting shadows, 4 icon-card rows, 14 px body, 1 real picture, 3 typefaces / 12 sizes | `docflow-landing#23` (baseline section + Step 4 gates) |
| mobile `side-scroll` at 390 px = the code block scrolling in its own box | `docflow-landing#23` / `docflow-landing#25` (defended) |
| Indonesian anchor slugs on the English page (`#fitur`…) | `docflow-landing#23` (preservation set) |

Gate trend since `docflow-landing#23`'s baseline: lint 37 FAIL / 6 WARN → **23 FAIL / 4 WARN**; inspect 12 FAIL / 4 WARN → **6 FAIL / 5 WARN** (contrast, headline-lines, covered-text now pass).

## 5. Filed issues

| Issue | Finding | Labels |
|---|---|---|
| `docflow-landing#31` | F1 GitHub chip accessible name | `a11y`, `bug` |
| `docflow-landing#32` | F2 `article[role=tabpanel]` | `a11y`, `bug` |
| `docflow-landing#33` | F3 footer heading order | `a11y`, `bug` |
| `docflow-landing#34` | F4 self-host the fonts | `performance` |
| `docflow-landing#35` | F5 wordmark as SVG | `performance` |
| `docflow-landing#36` | F6 soft 404 | `seo`, `bug` |
| `docflow-landing#37` | F7 social/canonical metadata | `seo` |
| `docflow-landing#38` | F8 Indonesian page not indexable | `seo`, `enhancement` |
| `docflow-landing#39` | F9 baseline response headers | `security` |
| `docflow-landing#40` | F10 GA4 before consent | `security` |
| `docflow-landing#41` | F11 dead lint/typecheck + no CI | `tech-debt` |
| `docflow-landing#42` | F12 contradicting hero claims | `enhancement` |

All 12 are assigned to @eppofahmi. Labels `a11y`, `performance`, `seo`, `security`, `tech-debt` were created in this run.

## 6. Watch list (below threshold)

| ID | Item | Why kept out |
|---|---|---|
| W1 | unused JS 93 KB (Nuxt payload on a single static page) | hydration is required here; low user-visible gain |
| W2 | longest paragraph ≈ 110 characters per line | design nit; covered by the `docflow-landing#23` typography lever |
| W3 | `sitemap.xml` has no `lastmod` | marginal for a one-URL site |
| W4 | favicon is a single 240 px PNG (no 180 px apple-touch, no SVG, no 32/16) | cosmetic on every modern browser |
| W5 | `Dockerfile` has no `HEALTHCHECK` and nginx runs as root; HTML is served `cf-cache-status: DYNAMIC` with no cache header | deploy hardening, not user-visible |
| W6 | `devtools: { enabled: true }` in `nuxt.config.ts:4` | not present in the generated bundle (checked `_nuxt/*.js`), so no payload cost today |

## 7. Summary

- **12 above-threshold findings**: 3 a11y, 2 performance, 3 SEO, 2 security, 1 quality-gate, 1 content.
- **The three that matter most**: the soft 404 on production (F6), the render-blocking Google Fonts that hold mobile LCP at 5 s (F4), and the fact that both quality scripts and CI are missing so nothing catches either (F11).
- **House-style debt is real but shrinking** and already owned by `docflow-landing#23` — do not open parallel tickets for it.
- Next: triage the filed issues, then act via the stack skills and open one PR per concern against `dev`.
