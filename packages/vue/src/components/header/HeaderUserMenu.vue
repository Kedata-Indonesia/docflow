<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { getInitials } from './initials.js'

/**
 * Avatar + name button with the account dropdown. Contents come from the host
 * app through the `user-menu` slot so the library stays auth-agnostic; the
 * slot receives `close` so host actions can dismiss the menu.
 */
const props = defineProps<{
  userName: string
  /** Treated as an image URL; initials are the fallback. */
  userAvatar: string
  /** Localized "Account" label shown when no user name is known. */
  accountLabel: string
}>()

const container = ref<HTMLElement | null>(null)
const userMenuOpen = ref(false)
const avatarError = ref(false)

const currentUserInitials = computed(() => getInitials(props.userName) || '?')

function close(): void {
  userMenuOpen.value = false
}

function toggleUserMenu(): void {
  userMenuOpen.value = !userMenuOpen.value
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as Node | null
  if (target && container.value?.contains(target)) return
  close()
}

onMounted(() => document.addEventListener('click', onDocumentClick, true))
onUnmounted(() => document.removeEventListener('click', onDocumentClick, true))
</script>

<template>
  <div ref="container" class="header-user-container relative flex-shrink-0">
    <button
      type="button"
      class="flex h-8 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      :title="props.userName"
      @click.stop="toggleUserMenu"
    >
      <img
        v-if="props.userAvatar && !avatarError"
        :src="props.userAvatar"
        :alt="props.userName"
        referrerpolicy="no-referrer"
        class="h-7 w-7 flex-shrink-0 rounded-full object-cover"
        @error="avatarError = true"
      >
      <span
        v-else
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white"
      >
        {{ currentUserInitials }}
      </span>
      <span class="hidden max-w-[140px] truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:inline">{{ props.userName || props.accountLabel }}</span>
      <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
    </button>

    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-[-4px]"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-[-4px]"
    >
      <div
        v-if="userMenuOpen"
        class="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
        style="transform-origin: top right;"
      >
        <div class="border-b border-slate-100 px-4 py-2 dark:border-slate-700/80">
          <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ props.userName || props.accountLabel }}</p>
        </div>
        <slot name="user-menu" :close="close" />
      </div>
    </Transition>
  </div>
</template>
