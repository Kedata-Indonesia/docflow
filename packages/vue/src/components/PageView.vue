<script setup lang="ts">
import type { BlockInfo, LayoutOptions, Page } from '@kedata-indonesia/docflow-layout-engine'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { computed, ref, watch, onUnmounted } from 'vue'

type Editor = DocsEditor['editor']

const props = withDefaults(
  defineProps<{
    pages: Page[]
    editor?: Editor | null
    layoutOptions?: LayoutOptions
    isPageless?: boolean
    pageColor?: string
  }>(),
  {
    editor: null,
    layoutOptions: () => ({
      pageWidth: 794,
      pageHeight: 1123,
      margins: { top: 96, bottom: 96, left: 96, right: 96 },
    }),
    isPageless: false,
    pageColor: '#ffffff',
  },
)

const domUpdateTrigger = ref(0)

const handleEditorUpdate = () => {
  domUpdateTrigger.value++
}

watch(
  () => props.editor,
  (newEditor, oldEditor) => {
    if (oldEditor && typeof oldEditor.off === 'function') {
      oldEditor.off('update', handleEditorUpdate)
    }
    if (newEditor && typeof newEditor.on === 'function') {
      newEditor.on('update', handleEditorUpdate)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (props.editor && typeof props.editor.off === 'function') {
    props.editor.off('update', handleEditorUpdate)
  }
})

const editorElement = computed(() => props.editor?.view?.dom ?? null)

const resolvedLayout = computed<Required<LayoutOptions>>(() => ({
  pageHeight: props.layoutOptions?.pageHeight ?? 1123,
  pageWidth: props.layoutOptions?.pageWidth ?? 794,
  margins: props.layoutOptions?.margins ?? {
    top: 96,
    bottom: 96,
    left: 96,
    right: 96,
  },
  maxCharsPerPage: 0,
}))

const pageStyle = computed(() => {
  const { pageWidth, pageHeight, margins } = resolvedLayout.value
  if (props.isPageless) {
    return {
      width: `${pageWidth}px`,
      minHeight: 'auto',
      height: 'auto',
      paddingTop: `${margins.top}px`,
      paddingBottom: `${margins.bottom}px`,
      paddingLeft: `${margins.left}px`,
      paddingRight: `${margins.right}px`,
      backgroundColor: props.pageColor,
      boxShadow: 'none',
      border: 'none',
      borderRadius: '0',
    }
  }
  return {
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
    paddingTop: `${margins.top}px`,
    paddingBottom: `${margins.bottom}px`,
    paddingLeft: `${margins.left}px`,
    paddingRight: `${margins.right}px`,
  }
})

const blockElements = (): HTMLElement[] => {
  if (!editorElement.value) return []
  return Array.from(editorElement.value.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  )
}

const findBlockElement = (block: BlockInfo): HTMLElement | null => {
  const elements = blockElements()
  return (
    elements.find((el) => {
      const from = parseInt(el.getAttribute('data-from') ?? '-1', 10)
      const to = parseInt(el.getAttribute('data-to') ?? '-1', 10)
      return from >= 0 && to >= from && from <= block.from && to >= block.to
    }) ?? null
  )
}

const extractBlockHTML = (block: BlockInfo): string | null => {
  if (!props.editor || !editorElement.value) return null
  const element = findBlockElement(block)
  if (!element) return null

  try {
    const view = props.editor.view
    const start = view.domAtPos(block.from)
    const end = view.domAtPos(block.to)
    if (!start || !end) return null

    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const fragment = range.cloneContents()
    const wrapper = document.createElement('div')
    wrapper.appendChild(fragment)
    return wrapper.innerHTML
  } catch {
    return null
  }
}

const blockContentMap = computed(() => {
  // Establish reactive dependency on editor updates
  domUpdateTrigger.value
  const map = new Map<string, string>()
  if (!props.editor || !editorElement.value) return map
  for (const page of props.pages) {
    for (const block of page.blocks) {
      const key = `${block.from}-${block.to}-${block.nodeType}`
      if (map.has(key)) continue
      const html = extractBlockHTML(block)
      if (html !== null) map.set(key, html)
    }
  }
  return map
})

const getBlockContent = (block: BlockInfo): string | null => {
  return (
    blockContentMap.value.get(
      `${block.from}-${block.to}-${block.nodeType}`,
    ) ?? null
  )
}
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div class="docs-editor-pages flex flex-col items-center gap-10">
    <div
      v-for="(page, pageIndex) in pages"
      :key="`${pageIndex}-${page.from}-${page.to}`"
      class="docs-editor-page tiptap ProseMirror relative box-border overflow-hidden text-slate-800 dark:text-[#e2e8f0]"
      :class="isPageless
        ? ''
        : 'editor-page-shadow rounded-lg border border-slate-200/70 bg-white dark:border-white/5 dark:bg-[#0a0f1e]'"
      :data-page-index="pageIndex"
      :style="pageStyle"
    >
      <div class="docs-editor-page__blocks flex flex-col" :style="isPageless ? {} : { height: '100%', overflow: 'hidden' }">
        <div
          v-for="block in page.blocks"
          :key="`${block.from}-${block.to}`"
          class="docs-editor-page__block"
          :data-node-type="block.nodeType"
          :data-from="block.from"
          :data-to="block.to"
        >
          <div
            v-if="getBlockContent(block) !== null"
            class="docs-editor-page__block-content"
            v-html="getBlockContent(block)"
          />
          <div v-else class="docs-editor-page__block-fallback flex justify-between text-sm text-slate-700">
            <span class="docs-editor-page__block-type font-medium">{{ block.nodeType }}</span>
            <span class="docs-editor-page__block-range text-slate-500">{{ block.from }}–{{ block.to }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- eslint-enable vue/no-v-html -->
</template>
