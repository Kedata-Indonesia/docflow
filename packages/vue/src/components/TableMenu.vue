<script setup lang="ts">
import { computed } from 'vue'
import type { Editor } from '@tiptap/core'
import { useLocale } from '../composables/useLocale.js'
import type { TableMenuPosition } from '../composables/useTableMenu.js'

const { t } = useLocale()

const props = defineProps<{
  editor: Editor | null
  position: TableMenuPosition | null
}>()

interface TableChain {
  [command: string]: (() => { run: () => boolean }) | undefined
}

function can(command: string): boolean {
  const ed = props.editor
  if (!ed) return false
  const chain = ed.can() as unknown as Record<string, (() => boolean) | undefined>
  const fn = chain[command]
  return typeof fn === 'function' ? fn() : false
}

function run(command: string): void {
  const ed = props.editor
  if (!ed) return
  const chain = ed.chain().focus() as unknown as TableChain
  chain[command]?.().run()
}

const items = computed(() => [
  { command: 'addRowBefore', label: `${t('editor.tableMenu.rows')} ↑`, title: t('editor.tableMenu.rowAbove') },
  { command: 'addRowAfter', label: `${t('editor.tableMenu.rows')} ↓`, title: t('editor.tableMenu.rowBelow') },
  { command: 'deleteRow', label: `${t('editor.tableMenu.rows')} −`, title: t('editor.tableMenu.rowDelete') },
  { command: 'addColumnBefore', label: `${t('editor.tableMenu.columns')} ←`, title: t('editor.tableMenu.colLeft') },
  { command: 'addColumnAfter', label: `${t('editor.tableMenu.columns')} →`, title: t('editor.tableMenu.colRight') },
  { command: 'deleteColumn', label: `${t('editor.tableMenu.columns')} −`, title: t('editor.tableMenu.colDelete') },
  { command: 'mergeCells', label: t('editor.tableMenu.merge'), title: t('editor.tableMenu.merge') },
  { command: 'splitCell', label: t('editor.tableMenu.split'), title: t('editor.tableMenu.split') },
  { command: 'toggleHeaderRow', label: t('editor.tableMenu.header'), title: t('editor.tableMenu.header') },
  { command: 'deleteTable', label: t('editor.tableMenu.deleteTable'), title: t('editor.tableMenu.deleteTable') },
])

function showSeparator(index: number): boolean {
  return index === 3 || index === 6 || index === 8
}
</script>

<template>
  <div
    v-if="position"
    data-testid="table-menu"
    class="docs-editor-table-menu fixed z-40 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 text-[11px] font-medium text-slate-700 shadow-xl dark:border-white/10 dark:bg-[#0c1329] dark:text-slate-200"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    @mousedown.prevent
  >
    <template v-for="(item, index) in items" :key="item.command">
      <span
        v-if="showSeparator(index)"
        class="mx-0.5 h-5 w-px bg-slate-200 dark:bg-white/10"
      />
      <button
        type="button"
        :data-action="item.command"
        :title="item.title"
        :aria-label="item.title"
        :disabled="!can(item.command)"
        class="flex h-7 items-center rounded px-1.5 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5"
        @click="run(item.command)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>
