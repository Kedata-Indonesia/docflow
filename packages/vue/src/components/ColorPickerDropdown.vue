<script setup lang="ts">
import { ref, watch } from 'vue'
import { Pencil, Plus } from 'lucide-vue-next'

export interface ColorPickerProps {
  isOpen: boolean
  activeColor?: string | null
  defaultColor?: string
  label?: string
}

const props = defineProps<ColorPickerProps>()
const emit = defineEmits<{
  select: [color: string]
  reset: []
  close: []
}>()

// Google Docs-inspired palette
const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4a1130'],
]

const customColor = ref('#000000')
const customInput = ref<HTMLInputElement | null>(null)

watch(() => props.isOpen, (open) => {
  if (open) customColor.value = props.activeColor || '#000000'
})

function select(color: string) {
  emit('select', color)
}

function reset() {
  emit('reset')
}

function selectCustom() {
  emit('select', customColor.value)
}

function handleClickOutside(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="color-picker-dropdown absolute left-0 top-full z-50 mt-1.5 w-[272px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#0e1525]"
    @click="handleClickOutside"
  >
    <div class="mb-3 grid grid-cols-10 gap-1.5">
      <button
        v-for="color in PALETTE[0]"
        :key="color"
        type="button"
        class="h-5 w-5 rounded-full border border-slate-200 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-600"
        :style="{ backgroundColor: color }"
        :title="color"
        @click="select(color)"
      />
    </div>

    <div class="space-y-2">
      <div v-for="(row, rowIndex) in PALETTE.slice(1)" :key="rowIndex" class="grid grid-cols-10 gap-1.5">
        <button
          v-for="color in row"
          :key="color"
          type="button"
          class="h-5 w-5 rounded-full border border-slate-200 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-600"
          :style="{ backgroundColor: color }"
          :title="color"
          @click="select(color)"
        />
      </div>
    </div>

    <div class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">
      <div class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {{ $props.label || 'Custom' }}
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          @click="customInput?.click()"
        >
          <Plus class="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
        </button>
        <input
          ref="customInput"
          v-model="customColor"
          type="color"
          class="sr-only"
          @change="selectCustom"
        />
        <div class="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 dark:border-slate-600">
          <div class="h-4 w-4 rounded-full" :style="{ backgroundColor: customColor }" />
        </div>
        <button
          type="button"
          class="ml-auto flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          @click="reset"
        >
          <Pencil class="h-3 w-3" />
          Default
        </button>
      </div>
    </div>
  </div>
</template>
