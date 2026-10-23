import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import {
  provideTheme,
  useTheme,
  type DocsTheme,
  type ThemeController,
} from '../composables/useTheme.js'

/** One harness component for every case — keeps `vue/one-component-per-file` happy. */
function harness(setup: () => void) {
  return defineComponent({
    setup() {
      setup()
      return () => h('div')
    },
  })
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('scoped theme (#375)', () => {
  it('keeps the theme on the editor instance and never the host page', async () => {
    let api!: ThemeController
    const mode = ref<DocsTheme | undefined>('dark')

    const wrapper = mount(
      harness(() => {
        api = provideTheme(() => mode.value)
      }),
      { attachTo: document.body },
    )

    try {
      await nextTick()
      expect(api.isDark.value).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)

      // The in-editor toggle overrides the attribute...
      api.toggle()
      await nextTick()
      expect(api.isDark.value).toBe(false)

      // ...until the host changes the attribute, which wins. (Changing to the
      // value it already had would not fire the watcher.)
      mode.value = 'light'
      await nextTick()
      expect(api.isDark.value).toBe(false)

      mode.value = 'dark'
      await nextTick()
      expect(api.isDark.value).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
})

describe('legacy theme', () => {
  it('still follows localStorage and toggles the document class', async () => {
    localStorage.setItem('docs-editor-theme', 'dark')
    let api!: ThemeController

    const wrapper = mount(
      harness(() => {
        api = useTheme()
      }),
      { attachTo: document.body },
    )

    try {
      await nextTick()
      expect(api.isDark.value).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      api.toggle()
      await nextTick()
      expect(api.isDark.value).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
      expect(localStorage.getItem('docs-editor-theme')).toBe('light')
    } finally {
      wrapper.unmount()
    }
  })
})
