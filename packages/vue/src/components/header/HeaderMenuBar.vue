<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { MenuItem } from '../menuStructure.js'
import HeaderMenuPanel from './HeaderMenuPanel.vue'
import type { UnimplementedMap } from './unimplemented.js'

/**
 * The menu bar under the title (File / Edit / View …).
 *
 * Menu-bar navigation mode: once the user opens a top-level menu (via click),
 * subsequent `mouseenter` events on neighboring menus switch the active menu
 * without requiring a second click — mirrors Google Docs / Word Web. Exit
 * conditions: clicking the active menu again, clicking outside the bar,
 * pressing Escape, or choosing an item.
 */
const props = defineProps<{
  menus: Record<string, { label: string; items: MenuItem[] }>
  unimplemented: UnimplementedMap
}>()

const emit = defineEmits<{
  select: [action: string]
}>()

const bar = ref<HTMLElement | null>(null)
const activeMenu = ref<string | null>(null)
const menuNavActive = ref(false)

function close(): void {
  activeMenu.value = null
  menuNavActive.value = false
}

function toggleMenu(key: string): void {
  const opening = activeMenu.value !== key
  activeMenu.value = opening ? key : null
  menuNavActive.value = opening
}

function onMenuBarMouseEnter(key: string): void {
  if (!menuNavActive.value) return
  if (activeMenu.value === key) return
  activeMenu.value = key
}

function onSelect(action: string): void {
  close()
  emit('select', action)
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Node | null
  if (target && bar.value?.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <nav ref="bar" class="header-menu-container hidden items-center gap-0 md:flex">
    <div
      v-for="key in Object.keys(props.menus)"
      :key="key"
      class="relative"
    >
      <button
        type="button"
        class="flex items-center gap-0.5 rounded px-2 py-0.5 text-[13px] transition-colors"
        :class="activeMenu === key
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
        @click.stop="toggleMenu(key)"
        @mouseenter="onMenuBarMouseEnter(key)"
      >
        {{ props.menus[key].label }}
      </button>

      <!-- Dropdown panel -->
      <Transition
        enter-active-class="transition-all duration-150 ease-out"
        enter-from-class="opacity-0 scale-95 translate-y-[-4px]"
        enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition-all duration-100 ease-in"
        leave-from-class="opacity-100 scale-100 translate-y-0"
        leave-to-class="opacity-0 scale-95 translate-y-[-4px]"
      >
        <HeaderMenuPanel
          v-if="activeMenu === key"
          :menu="props.menus[key]"
          :unimplemented="props.unimplemented"
          @select="onSelect"
        />
      </Transition>
    </div>
  </nav>
</template>
