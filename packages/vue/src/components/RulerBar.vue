<script setup lang="ts">
import type { LayoutOptions } from '@kedata-indonesia/docflow-layout-engine'
import { computed } from 'vue'

const props = defineProps<{
  layoutOptions?: LayoutOptions
  /** Issue #144 — zoom in percent, so ticks/margins scale with the paper. */
  zoom?: number
  /** Measured visual left of the paper relative to this ruler. */
  pageLeftPx?: number | null
  /** Measured visual width of the paper. */
  pageWidthPx?: number | null
}>()

const resolved = computed(() => ({
  pageWidth: props.layoutOptions?.pageWidth ?? 794,
  margins: props.layoutOptions?.margins ?? { top: 96, bottom: 96, left: 96, right: 96 },
}))

const scale = computed(() => Math.max(0.01, (props.zoom ?? 100) / 100))
// Prefer the measured track so horizontal scrolling and narrow viewports keep
// the ruler over the paper; fall back to the scaled page width before mount.
const trackWidth = computed(() => props.pageWidthPx ?? resolved.value.pageWidth * scale.value)

const ticks = computed(() => {
  const spacing = 48 * scale.value
  const count = Math.max(1, Math.ceil(trackWidth.value / spacing))
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: i * spacing,
    major: i % 2 === 0,
    label: i % 2 === 0 && i > 0 ? Math.round(i / 2) : '',
  }))
})

const leftMarginPx = computed(() => `${resolved.value.margins.left * scale.value}px`)
const rightMarginPx = computed(() => `${(resolved.value.pageWidth - resolved.value.margins.right) * scale.value}px`)
</script>

<template>
  <div
    class="docs-editor-ruler relative h-6 w-full flex-shrink-0 overflow-hidden border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0a0f1e]"
  >
    <div
      class="absolute inset-y-0 h-full"
      :style="{
        width: `${trackWidth}px`,
        left: pageLeftPx != null ? `${pageLeftPx}px` : '50%',
        transform: pageLeftPx != null ? 'none' : 'translateX(-50%)',
      }"
    >
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
          v-for="tick in ticks"
          :key="tick.x"
          class="absolute top-0 border-l border-slate-300 dark:border-slate-600"
          :class="tick.major ? 'h-3' : 'h-1.5'"
          :style="{ left: `${tick.x}px` }"
        >
          <span v-if="tick.label !== ''" class="absolute -top-2 left-0.5 text-[9px] text-slate-400">{{ tick.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
