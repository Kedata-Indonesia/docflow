<template>
  <div v-if="isReady" class="virtual-page-overlay" aria-hidden="true">
    <div
      v-for="p in visiblePages"
      :key="p.index"
      class="vp-page"
      :style="pageStyle(p)"
    >
      <!-- Page gap area (visual separator between pages) -->
      <div class="vp-gap" :style="gapStyle" />

      <!-- Header -->
      <div class="vp-header" :style="headerStyle">
        <span class="vp-header-left" v-html="config.headerLeft" />
        <span class="vp-header-right" v-html="config.headerRight" />
      </div>

      <!-- Footer -->
      <div class="vp-footer" :style="footerStyle">
        <span class="vp-footer-left" v-html="resolveFooter(config.footerLeft, p.index)" />
        <span class="vp-footer-right" v-html="resolveFooter(config.footerRight, p.index)" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VisiblePage, PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'

const props = defineProps<{
  data: PageOverlayData
  isReady: boolean
}>()

const visiblePages = computed(() => props.data.visiblePages)
const config = computed(() => props.data.config)
const ps = computed(() => config.value.pageSize)

const gapStyle = computed(() => ({
  height: `${config.value.pageGap}px`,
}))

const headerStyle = computed(() => ({
  paddingTop: `${config.value.margins.top}px`,
  paddingLeft: `${config.value.margins.left}px`,
  paddingRight: `${config.value.margins.right}px`,
  height: `${config.value.margins.top}px`,
}))

const footerStyle = computed(() => ({
  paddingBottom: `${config.value.margins.bottom}px`,
  paddingLeft: `${config.value.margins.left}px`,
  paddingRight: `${config.value.margins.right}px`,
}))

function pageStyle(p: VisiblePage) {
  return {
    top: `${p.top}px`,
    height: `${ps.value.pageHeight + config.value.pageGap}px`,
    width: `${ps.value.pageWidth}px`,
  }
}

function resolveFooter(template: string, pageIndex: number): string {
  return template
    .replace(/\{page\}/g, String(pageIndex + 1))
    .replace(/\{total\}/g, String(props.data.totalPages))
}
</script>

<style scoped>
.virtual-page-overlay {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 0;
}

.vp-page {
  position: absolute;
  left: 0;
  pointer-events: none;
  background: var(--vp-page-bg, #ffffff);
  border: 1px solid var(--vp-border, #e5e5e5);
  box-sizing: border-box;
}

.vp-gap {
  background: var(--vp-gap-bg, #f1f5f9);
  border-top: 1px solid var(--vp-border, #e5e5e5);
  border-bottom: 1px solid var(--vp-border, #e5e5e5);
}

.vp-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--vp-header-color, #9ca3af);
  opacity: 0.7;
}

.vp-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--vp-footer-color, #9ca3af);
  opacity: 0.7;
}

.vp-header-left,
.vp-footer-left {
  text-align: left;
}

.vp-header-right,
.vp-footer-right {
  text-align: right;
}
</style>
