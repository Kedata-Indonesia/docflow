<script setup lang="ts">
import type { LayoutOptions } from '@kedata-indonesia/docflow-layout-engine'
import { computed, ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'
import { PAGE_MARGIN_MAX_PX } from '../composables/usePageSetup.js'

const props = defineProps<{
  layoutOptions?: LayoutOptions
  /** Issue #144 — zoom in percent, so ticks/margins scale with the paper. */
  zoom?: number
  /** Measured visual left of the paper relative to this ruler. */
  pageLeftPx?: number | null
  /** Measured visual width of the paper. */
  pageWidthPx?: number | null
}>()

/**
 * Issue #295 — dragging a margin marker edits the page margins. The ruler owns no
 * state: it reports the margins it wants, and `DocsEditor` writes them into the same
 * ref the Page Setup dialog uses, so the paper re-lays out and both controls agree.
 */
const emit = defineEmits<{
  'update:margins': [margins: { top: number; bottom: number; left: number; right: number }]
}>()

const { t } = useLocale()

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

type MarginSide = 'left' | 'right'

/** One arrow-key press moves a margin by 8px (24px with Shift). */
const KEY_STEP_PX = 8

/**
 * Same 5 cm cap the Page Setup dialog enforces, and never more than half the page —
 * a margin the dialog cannot reproduce would be a value the user cannot undo there.
 */
const maxMarginPx = computed(() => Math.min(PAGE_MARGIN_MAX_PX, Math.round(resolved.value.pageWidth / 2)))

const markers = computed(() => [
  {
    side: 'left' as MarginSide,
    label: t('a11y.leftMargin'),
    x: resolved.value.margins.left * scale.value,
  },
  {
    side: 'right' as MarginSide,
    label: t('a11y.rightMargin'),
    x: (resolved.value.pageWidth - resolved.value.margins.right) * scale.value,
  },
])

const dragging = ref<MarginSide | null>(null)
let dragStartX = 0
let dragStartPx = 0

function marginPx(side: MarginSide): number {
  return side === 'left' ? resolved.value.margins.left : resolved.value.margins.right
}

function clampMargin(px: number): number {
  return Math.round(Math.min(maxMarginPx.value, Math.max(0, px)))
}

/**
 * Apply a proposed margin. The right marker sits at `pageWidth - right`, so moving it
 * left grows the margin — that sign lives here, once, instead of at every caller.
 */
function setMargin(side: MarginSide, px: number): void {
  const next = clampMargin(px)
  if (next === marginPx(side)) return
  emit('update:margins', { ...resolved.value.margins, [side]: next })
}

function handlePointerDown(side: MarginSide, event: PointerEvent): void {
  dragging.value = side
  dragStartX = event.clientX
  dragStartPx = marginPx(side)
  // Keep receiving moves when the pointer leaves the 16px hit area mid-drag.
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function handlePointerMove(event: PointerEvent): void {
  const side = dragging.value
  if (!side) return
  // Pointer deltas are visual px; margins are layout px, so undo the zoom scale.
  const delta = (event.clientX - dragStartX) / scale.value
  setMargin(side, dragStartPx + (side === 'left' ? delta : -delta))
}

function handlePointerUp(event: PointerEvent): void {
  if (!dragging.value) return
  ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
  dragging.value = null
}

function handleKeydown(side: MarginSide, event: KeyboardEvent): void {
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (direction === 0) return
  event.preventDefault()
  const step = event.shiftKey ? KEY_STEP_PX * 3 : KEY_STEP_PX
  setMargin(side, marginPx(side) + direction * step * (side === 'left' ? 1 : -1))
}
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
      <!-- Margin markers: a 16px hit area centred on the margin line, triangle on top. -->
      <div
        v-for="marker in markers"
        :key="marker.side"
        class="absolute top-0 z-10 -ml-2 flex h-full w-4 cursor-col-resize touch-none items-start justify-center outline-none focus-visible:bg-blue-400/20"
        :class="dragging === marker.side ? 'bg-blue-400/20' : 'hover:bg-blue-400/10'"
        :style="{ left: `${marker.x}px` }"
        role="separator"
        aria-orientation="vertical"
        :aria-label="marker.label"
        :aria-valuenow="Math.round(marginPx(marker.side))"
        :aria-valuemin="0"
        :aria-valuemax="maxMarginPx"
        :tabindex="0"
        :data-testid="`ruler-margin-${marker.side}`"
        @pointerdown="handlePointerDown(marker.side, $event)"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @keydown="handleKeydown(marker.side, $event)"
      >
        <div
          class="pointer-events-none h-0 w-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-400"
        />
      </div>

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
