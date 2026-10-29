<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import type { MenuItem } from '../menuStructure.js'
import {
  isUnimplemented,
  menuItemClass,
  unimplementedHint,
  type UnimplementedMap,
} from './unimplemented.js'
import { useLocale } from '../../composables/useLocale.js'

/**
 * One open dropdown panel of the header menu bar. Sub-menu state lives here
 * (not in the bar) because only one panel is mounted at a time: switching
 * between top-level menus remounts the panel, which resets hover/submenu state
 * for free.
 */
const props = defineProps<{
  menu: { label: string; items: MenuItem[] }
  unimplemented: UnimplementedMap
}>()

const emit = defineEmits<{
  select: [action: string]
}>()

const { t } = useLocale()

/** Index of the item whose sub-panel is open. */
const hoveredSub = ref<number | null>(null)
// Open upward when the sub-menu would run past the viewport bottom (e.g. the
// Insert → Page numbers item sits near the bottom of a long menu).
const submenuUp = ref(false)

function openSubmenu(index: number): void {
  hoveredSub.value = index
  submenuUp.value = false
  void nextTick(() => {
    const panel = document.querySelector<HTMLElement>(
      '[data-testid="header-menu-panel"] [data-submenu-panel]',
    )
    if (!panel) return
    submenuUp.value = panel.getBoundingClientRect().bottom > window.innerHeight - 8
  })
}

function closeSubmenu(): void {
  hoveredSub.value = null
}
</script>

<template>
  <div
    data-testid="header-menu-panel"
    class="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
    style="transform-origin: top left;"
  >
    <template v-for="(item, idx) in props.menu.items" :key="idx">
      <!-- Divider -->
      <div v-if="item.divider" class="my-1 border-t border-slate-100 dark:border-slate-700/80" />

      <!-- Sub-menu item -->
      <div
        v-else-if="item.sub"
        class="relative"
        @mouseenter="openSubmenu(idx)"
        @mouseleave="closeSubmenu()"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-6 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
        >
          <span class="flex items-center gap-2.5">
            <component
              :is="item.icon"
              v-if="item.icon"
              class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
            />
            {{ item.label }}
          </span>
          <ChevronDown class="h-3.5 w-3.5 -rotate-90 text-slate-400" />
        </button>

        <!-- Sub-panel -->
        <Transition
          enter-active-class="transition-all duration-100 ease-out"
          enter-from-class="opacity-0 translate-x-2"
          enter-to-class="opacity-100 translate-x-0"
          leave-active-class="transition-all duration-75 ease-in"
          leave-from-class="opacity-100 translate-x-0"
          leave-to-class="opacity-0 translate-x-2"
        >
          <div
            v-if="hoveredSub === idx"
            data-submenu-panel
            :class="submenuUp ? 'bottom-0' : 'top-0'"
            class="absolute left-full z-50 ml-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
          >
            <button
              v-for="sub in item.sub"
              :key="sub.action"
              type="button"
              :class="menuItemClass(props.unimplemented, sub.action)"
              :title="unimplementedHint(props.unimplemented, sub.action, t)"
              :aria-disabled="isUnimplemented(props.unimplemented, sub.action) ? 'true' : undefined"
              @click.stop="emit('select', sub.action)"
            >
              <span class="flex items-center gap-2.5">
                <component
                  :is="sub.icon"
                  v-if="sub.icon"
                  class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                />
                {{ sub.label }}
                <!-- Host-owned marker (#153): never colour-only. -->
                <span
                  v-if="isUnimplemented(props.unimplemented, sub.action)"
                  class="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-mono text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                >
                  {{ t('header.hostOwned') }}
                </span>
              </span>
              <span
                v-if="sub.badge"
                class="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-mono text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              >
                {{ sub.badge }}
              </span>
              <span
                v-else-if="sub.shortcut"
                class="text-[11px] text-slate-400 dark:text-slate-500"
              >
                {{ sub.shortcut }}
              </span>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Regular action item -->
      <button
        v-else
        type="button"
        :class="menuItemClass(props.unimplemented, item.action)"
        :title="unimplementedHint(props.unimplemented, item.action, t)"
        :aria-disabled="isUnimplemented(props.unimplemented, item.action) ? 'true' : undefined"
        @click.stop="emit('select', item.action!)"
      >
        <span class="flex items-center gap-2.5">
          <component
            :is="item.icon"
            v-if="item.icon"
            class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
          />
          {{ item.label }}
          <!-- Host-owned marker (#153): never colour-only. -->
          <span
            v-if="isUnimplemented(props.unimplemented, item.action)"
            class="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-mono text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
          >
            {{ t('header.hostOwned') }}
          </span>
        </span>
        <span
          v-if="item.checked"
          class="text-blue-600 dark:text-blue-400"
        >
          <Check class="h-3.5 w-3.5" />
        </span>
        <span
          v-else-if="item.shortcut"
          class="text-[11px] text-slate-400 dark:text-slate-500"
        >
          {{ item.shortcut }}
        </span>
      </button>
    </template>
  </div>
</template>
