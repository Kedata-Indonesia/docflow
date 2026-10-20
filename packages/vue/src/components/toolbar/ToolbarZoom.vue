<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { useLocale } from '../../composables/useLocale.js'
import { ZOOM_PRESETS } from '../../composables/useEditorZoom.js'
import { controlBaseClass } from './toolbarConfig.js'

/**
 * Issue #144 — the zoom preset dropdown. The trigger shows the current
 * percentage; the menu offers 50–200 %. It is disabled while virtual pages are
 * on (that experimental surface is not zoom-aware).
 */
const { t } = useLocale()

const props = defineProps<{
  zoom: number
  open: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  apply: [zoom: number]
}>()

const label = () => (props.disabled ? t('toolbar.zoomVirtualPages') : t('toolbar.zoom'))
</script>

<template>
  <div class="toolbar-dropdown relative flex-shrink-0">
    <button
      type="button"
      data-testid="toolbar-zoom"
      :class="[controlBaseClass, 'w-[64px] justify-between gap-1 px-2 text-xs']"
      :title="label()"
      :aria-label="label()"
      :aria-expanded="open"
      aria-haspopup="menu"
      :disabled="disabled"
      @mousedown.prevent
      @click.stop="emit('toggle')"
    >
      <span>{{ zoom }}%</span>
      <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
    </button>

    <div
      v-if="open"
      data-testid="toolbar-zoom-menu"
      class="absolute left-0 top-full z-50 mt-1 min-w-[96px] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-slate-900"
    >
      <button
        v-for="preset in ZOOM_PRESETS"
        :key="preset"
        type="button"
        class="flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-white/5"
        :class="preset === zoom ? 'text-blue-600 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'"
        @mousedown.prevent
        @click="emit('apply', preset)"
      >
        {{ preset }}%
      </button>
    </div>
  </div>
</template>
