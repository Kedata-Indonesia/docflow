<script setup lang="ts">
import type { LayoutOptions } from '@docs-editor/layout-engine'
import { computed } from 'vue'

const props = defineProps<{
  layoutOptions?: LayoutOptions
}>()

const resolved = computed(() => ({
  pageWidth: props.layoutOptions?.pageWidth ?? 794,
  margins: props.layoutOptions?.margins ?? { top: 96, bottom: 96, left: 96, right: 96 },
}))

const ticks = computed(() => {
  const count = Math.floor(resolved.value.pageWidth / 48)
  return Array.from({ length: count + 1 }, (_, i) => i * 48)
})

const leftMarginPx = computed(() => `${resolved.value.margins.left}px`)
const rightMarginPx = computed(() => `${resolved.value.pageWidth - resolved.value.margins.right}px`)
</script>

<template>
  <div class="docs-editor-ruler relative h-6 w-full flex-shrink-0 overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0a0f1e]">
    <div class="absolute inset-y-0 mx-auto h-full" :style="{ width: `${resolved.pageWidth}px`, left: '50%', transform: 'translateX(-50%)' }">
      <!-- Margin markers -->
      <div
        class="absolute top-0 z-10 h-0 w-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-400"
        :style="{ left: leftMarginPx, transform: 'translateX(-4px)' }"
      />
      <div
        class="absolute top-0 z-10 h-0 w-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-400"
        :style="{ left: rightMarginPx, transform: 'translateX(-4px)' }"
      />

      <!-- Tick marks -->
      <div class="absolute inset-x-0 top-2.5 h-full">
        <div
          v-for="x in ticks"
          :key="x"
          class="absolute top-0 border-l border-slate-300 dark:border-slate-600"
          :class="x % 96 === 0 ? 'h-3' : 'h-1.5'"
          :style="{ left: `${x}px` }"
        >
          <span v-if="x % 96 === 0 && x > 0" class="absolute -top-2 left-0.5 text-[9px] text-slate-400">{{ x / 96 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
