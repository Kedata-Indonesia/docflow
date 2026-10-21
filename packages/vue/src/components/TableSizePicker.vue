<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  select: [size: { rows: number; cols: number }]
  close: []
}>()

const MAX = 8
const hoverRows = ref(3)
const hoverCols = ref(3)
const cells = Array.from({ length: MAX * MAX }, (_, i) => ({
  row: Math.floor(i / MAX) + 1,
  col: (i % MAX) + 1,
}))

const sizeLabel = computed(() => t('editor.tableMenu.size', { rows: hoverRows.value, cols: hoverCols.value }))

function pick(rows: number, cols: number): void {
  emit('select', { rows, cols })
}
</script>

<template>
  <div
    v-if="props.isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm select-none"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 text-slate-800 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] dark:text-slate-200">
      <h2 class="mb-4 text-lg font-medium">{{ t('editor.tableMenu.insertTableTitle') }}</h2>
      <div class="grid w-fit gap-1" :style="{ gridTemplateColumns: `repeat(${MAX}, minmax(0, 1fr))` }">
        <button
          v-for="cell in cells"
          :key="`${cell.row}-${cell.col}`"
          type="button"
          class="h-5 w-5 rounded-sm border transition-colors"
          :class="cell.row <= hoverRows && cell.col <= hoverCols
            ? 'border-blue-500 bg-blue-500/25'
            : 'border-slate-200 bg-white hover:border-blue-400 dark:border-slate-700 dark:bg-white/5'"
          :title="`${cell.row} × ${cell.col}`"
          :aria-label="`${cell.row} × ${cell.col}`"
          @mouseenter="hoverRows = cell.row; hoverCols = cell.col"
          @click="pick(cell.row, cell.col)"
        />
      </div>
      <div class="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">{{ sizeLabel }}</div>
      <div class="mt-5 flex justify-end">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</template>
