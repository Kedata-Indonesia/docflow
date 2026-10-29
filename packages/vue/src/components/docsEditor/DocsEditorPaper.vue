<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { LayoutOptions, PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'
import type { DocsEditorPaperRefs } from './docsEditorPaperTypes.js'
import { useLocale } from '../../composables/useLocale.js'
import VirtualPageOverlay from '../VirtualPageOverlay.vue'
import VerticalRuler from '../VerticalRuler.vue'

/**
 * Scroll container + zoom surface + the ProseMirror mount point.
 *
 * The element refs are owned by `DocsEditor` (the paging, ruler, zoom and
 * editor composables read the same objects), so they arrive as a plain bundle
 * (`docsEditorPaperTypes.ts`) rather than being re-created here — a bundle
 * object also survives Vue's template ref-unwrapping, which would otherwise
 * hand the child `null` instead of the `Ref`.
 *
 * The scoped `.docs-editor__paper` rule lives in this file because scoped
 * styles follow the element into its component.
 */

const props = defineProps<{
  elementRefs: DocsEditorPaperRefs
  outerStyle?: CSSProperties
  innerStyle?: CSSProperties
  paperMaxWidth?: string
  showRuler?: boolean
  focusMode?: boolean
  layoutOptions?: LayoutOptions
  zoom?: number
  useVirtual?: boolean
  virtualData?: PageOverlayData
  virtualReady?: boolean
  isReady?: boolean
}>()

const emit = defineEmits<{ scroll: [] }>()

const { t } = useLocale()
</script>

<template>
  <div
    :ref="props.elementRefs.scroll"
    class="docs-editor-scroll relative flex flex-1 overflow-auto px-4 py-6 bg-slate-100 dark:bg-[#02040a]"
    @scroll="emit('scroll')"
  >
    <VerticalRuler
      v-if="props.showRuler && !props.focusMode"
      :layout-options="props.layoutOptions" :zoom="props.zoom"
    />
    <div class="flex flex-1 flex-col items-center gap-4 w-full relative">
      <div class="docs-editor-zoom w-full" data-testid="docs-editor-zoom" :style="props.outerStyle">
        <div
          :ref="props.elementRefs.surface"
          class="docs-editor-zoom__inner relative w-full"
          :style="[props.innerStyle, { maxWidth: props.paperMaxWidth }]"
        >
          <!-- Virtual Page Overlay (experimental) — renders only visible pages,
               absolutely positioned over the editor, behind content (z-index: 0) -->
          <VirtualPageOverlay
            v-if="props.useVirtual && props.virtualData"
            :data="props.virtualData"
            :is-ready="Boolean(props.virtualReady)"
          />
          <!-- Loading Indicator Overlay -->
          <div
            v-if="!props.isReady"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white dark:bg-[#0e1525]/60 backdrop-blur-[2px] gap-3 rounded-lg"
            :aria-label="t('editor.loadingDocument')"
          />
          <!-- Editor -->
          <div
            :ref="props.elementRefs.editor"
            class="docs-editor__paper outline-none text-slate-800 dark:text-[#e2e8f0]"
            :class="{ 'opacity-40': !props.isReady }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-editor__paper {
  background-color: #ffffff !important;
  border-radius: 4px;
}
:global(.dark) .docs-editor__paper {
  background-color: #1e293b !important;
}
</style>
