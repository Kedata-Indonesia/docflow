import { onMounted, ref } from 'vue'

const STORAGE_KEY = 'docs-editor-theme'
const isDark = ref(false)

export function useTheme() {

  const apply = (dark: boolean) => {
    isDark.value = dark
    if (typeof document !== 'undefined') {
      const html = document.documentElement
      if (dark) html.classList.add('dark')
      else html.classList.remove('dark')
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
    }
  }

  const toggle = () => apply(!isDark.value)

  onMounted(() => {
    let dark = false
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        dark = stored === 'dark'
      } else if (typeof window !== 'undefined') {
        dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      }
    }
    apply(dark)
  })

  return {
    isDark,
    toggle,
  }
}
