import { computed, inject, onMounted, provide, ref, watch, type InjectionKey, type Ref } from 'vue'

const STORAGE_KEY = 'docs-editor-theme'

/** Explicit editor theme. Omit it to keep the document-level auto behaviour. */
export type DocsTheme = 'light' | 'dark'

export interface ThemeController {
  isDark: Ref<boolean>
  toggle: () => void
}

const THEME_KEY: InjectionKey<ThemeController> = Symbol('docflow:theme')

// ─── Legacy (document-level) theme ─────────────────────────────────────────
// Kept for backwards compatibility: `useTheme()` outside an editor still
// follows localStorage / prefers-color-scheme and toggles `<html class="dark">`.

const legacyIsDark = ref(false)

function detectInitialDark(): boolean {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored === 'dark'
  }
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

function applyDocumentTheme(dark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', dark)
}

function persistTheme(dark: boolean): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
}

function initLegacyTheme(): void {
  const dark = detectInitialDark()
  legacyIsDark.value = dark
  applyDocumentTheme(dark)
  persistTheme(dark)
}

const legacyController: ThemeController = {
  isDark: legacyIsDark,
  toggle() {
    const dark = !legacyIsDark.value
    legacyIsDark.value = dark
    applyDocumentTheme(dark)
    persistTheme(dark)
  },
}

/**
 * Provide a theme controller for one editor instance.
 *
 * With an explicit mode (`light`/`dark`) the theme is scoped to the editor:
 * only the editor root receives the `dark` class, and the host page's `<html>`
 * and localStorage are left alone. This is what makes `<docs-editor theme="dark">`
 * work inside Shadow DOM and keeps multiple embeds independent.
 *
 * Without a mode it delegates to the legacy document-level theme, so the Vue
 * app keeps its current behaviour (html class + persistence).
 */
export function provideTheme(getMode: () => DocsTheme | undefined): ThemeController {
  const scoped = computed(() => getMode() !== undefined)
  const override = ref<DocsTheme | null>(null)
  const scopedIsDark = ref(false)

  watch(
    () => [scoped.value, getMode(), override.value] as const,
    () => {
      if (scoped.value) {
        scopedIsDark.value = (override.value ?? getMode()) === 'dark'
      }
    },
    { immediate: true },
  )

  // A host rewriting the theme attribute wins over a previous in-editor toggle.
  watch(
    () => getMode(),
    () => {
      override.value = null
    },
  )

  onMounted(() => {
    if (!scoped.value) initLegacyTheme()
  })

  // If a host starts passing a theme after mount, stop painting the host page;
  // the editor root takes over.
  watch(scoped, (isScoped) => {
    if (isScoped) applyDocumentTheme(false)
  })

  const controller: ThemeController = {
    isDark: computed(() => (scoped.value ? scopedIsDark.value : legacyIsDark.value)),
    toggle() {
      if (!scoped.value) {
        legacyController.toggle()
        return
      }
      override.value = scopedIsDark.value ? 'light' : 'dark'
    },
  }

  provide(THEME_KEY, controller)
  return controller
}

/**
 * Theme controller for the current editor. Components inside `<DocsEditor>` get
 * the instance-scoped controller; anything else gets the legacy document theme.
 */
export function useTheme(): ThemeController {
  const injected = inject(THEME_KEY, null)
  if (injected) return injected
  onMounted(initLegacyTheme)
  return legacyController
}
