import { onMounted, onUnmounted, ref } from 'vue'

export type DropdownKey = 'heading' | 'font' | 'align' | 'lists' | 'insert' | 'textColor' | 'highlight' | 'zoom'

/**
 * One owner for the toolbar's mutually-exclusive dropdowns and for the single
 * document-level click listener that closes them.
 */
export function useToolbarDropdowns() {
  const activeDropdown = ref<DropdownKey | null>(null)

  function toggleDropdown(key: DropdownKey) {
    activeDropdown.value = activeDropdown.value === key ? null : key
  }

  function closeAll() {
    activeDropdown.value = null
  }

  function closeDropdowns(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.toolbar-dropdown')) activeDropdown.value = null
  }

  onMounted(() => document.addEventListener('click', closeDropdowns, true))
  onUnmounted(() => document.removeEventListener('click', closeDropdowns, true))

  return { activeDropdown, toggleDropdown, closeAll }
}
