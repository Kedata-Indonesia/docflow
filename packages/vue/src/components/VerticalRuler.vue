<script setup lang="ts">
import type { LayoutOptions } from '@docs-editor/layout-engine'
import { computed } from 'vue'

const props = defineProps<{
  layoutOptions?: LayoutOptions
}>()

const resolved = computed(() => ({
  pageHeight: props.layoutOptions?.pageHeight ?? 1123,
  margins: props.layoutOptions?.margins ?? { top: 96, bottom: 96, left: 96, right: 96 },
}))

const ticks = computed(() => {
  const count = Math.floor(resolved.value.pageHeight / 48)
  return Array.from({ length: count + 1 }, (_, i) => i * 48)
})
</script>

<template>
  <div
    class="docs-editor-vertical-ruler sticky top-0 hidden w-6 flex-shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0a0f1e] lg:block"
    :style="{ minHeight: `${resolved.pageHeight}px` }"
  >
    <div class="relative h-full w-full">
      <div
        v-for="y in ticks"
        :key="y"
        class="absolute right-0 border-t border-slate-300 dark:border-slate-600"
        :class="y % 96 === 0 ? 'w-3' : 'w-1.5'"
        :style="{ top: `${y}px` }"
      >
        <span v-if="y % 96 === 0 && y > 0" class="absolute -top-2 right-3 text-[9px] text-slate-400">{{ y / 96 }}</span>
      </div>
    </div>
  </div>
</template>
