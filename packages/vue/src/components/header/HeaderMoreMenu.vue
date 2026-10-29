<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { MoreVertical, Users } from 'lucide-vue-next'
import ThemeToggle from '../ThemeToggle.vue'

/**
 * Overflow ("More") menu for the secondary header actions that do not fit
 * inline on small screens. Host extras arrive through the `overflow-actions`
 * slot (e.g. Print, Logout) and receive `close`.
 */
const props = defineProps<{
  editable: boolean
  moreLabel: string
  sandboxLabel: string
  themeLabel: string
}>()

const emit = defineEmits<{
  'toggle-simulators': []
}>()

const container = ref<HTMLElement | null>(null)
const moreOpen = ref(false)

function close(): void {
  moreOpen.value = false
}

function toggleMore(): void {
  moreOpen.value = !moreOpen.value
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
  <div ref="container" class="header-more-container relative xl:hidden">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      :title="props.moreLabel"
      :aria-label="props.moreLabel"
      aria-haspopup="menu"
      @click.stop="toggleMore"
    >
      <MoreVertical class="h-[18px] w-[18px]" />
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
        v-if="moreOpen"
        class="absolute right-0 top-full z-50 mt-1 min-w-[210px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
        style="transform-origin: top right;"
      >
        <!-- Host-app extras (e.g. Print, Logout) -->
        <slot name="overflow-actions" :close="close" />

        <button
          v-if="props.editable"
          type="button"
          class="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
          @click="emit('toggle-simulators'); close()"
        >
          <Users class="h-4 w-4 text-slate-400" />
          <span>{{ props.sandboxLabel }}</span>
        </button>
        <div class="my-1 border-t border-slate-100 dark:border-slate-700/80" />
        <div class="flex items-center justify-between px-4 py-2">
          <span>{{ props.themeLabel }}</span>
          <ThemeToggle />
        </div>
      </div>
    </Transition>
  </div>
</template>
