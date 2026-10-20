<script setup lang="ts">
import type { LayoutOptions } from '@kedata-indonesia/docflow-layout-engine'
import { computed } from 'vue'

const props = defineProps<{
  layoutOptions?: LayoutOptions
  /** Issue #144 — zoom in percent, so ticks scale with the paper. */
  zoom?: number
}>()

const resolved = computed(() => ({
  pageHeight: props.layoutOptions?.pageHeight ?? 1123,
  margins: props.layoutOptions?.margins ?? { top: 96, bottom: 96, left: 96, right: 96 },
}))

const scale = computed(() => Math.max(0.01, (props.zoom ?? 100) / 100))
const scaledHeight = computed(() => resolved.value.pageHeight * scale.value)

const ticks = computed(() => {
  const spacing = 48 * scale.value
  const count = Math.max(1, Math.ceil(scaledHeight.value / spacing))
  return Array.from({ length: count + 1 }, (_, i) => ({
    y: i * spacing,
    major: i % 2 === 0,
    label: i % 2 === 0 && i > 0 ? Math.round(i / 2) : '',
  }))
})
</script>

<template>
  <div
    class="docs-editor-vertical-ruler sticky top-0 hidden w-6 flex-shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0a0f1e] lg:block"
    :style="{ minHeight: `${scaledHeight}px` }"
  >
    <div class="relative h-full w-full">
      <div
        v-for="tick in ticks"
        :key="tick.y"
        class="absolute right-0 border-t border-slate-300 dark:border-slate-600"
        :class="tick.major ? 'w-3' : 'w-1.5'"
        :style="{ top: `${tick.y}px` }"
      >
        <span v-if="tick.label !== ''" class="absolute -top-2 right-3 text-[9px] text-slate-400">{{ tick.label }}</span>
      </div>
    </div>
  </div>
</template>
