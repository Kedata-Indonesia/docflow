<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowLeft, Plus, MoreVertical, FileText } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'
import { useLocale } from '../composables/useLocale.js'

const { t } = useLocale()

interface DocumentTab {
  id: string
  label: string
  active?: boolean
}

const props = withDefaults(
  defineProps<{
    tabs?: DocumentTab[]
    editor?: Editor | null
    backTitle?: string
  }>(),
  {
    tabs: () => [{ id: 'tab-1', label: 'Tab 1', active: true }],
    editor: null,
    backTitle: '',
  },
)

const effectiveBackTitle = computed(() => props.backTitle || t('common.cancel'))

const emit = defineEmits<{
  collapse: []
  'add-tab': []
  'select-tab': [id: string]
  'delete-tab': [id: string]
  'rename-tab': [payload: { id: string; label: string }]
}>()

const activeMenuTabId = ref<string | null>(null)
const renamingTabId = ref<string | null>(null)
const renameLabel = ref('')

const startRename = (tab: DocumentTab) => {
  renamingTabId.value = tab.id
  renameLabel.value = tab.label
  activeMenuTabId.value = null
}

const saveRename = (id: string) => {
  if (renameLabel.value.trim()) {
    emit('rename-tab', { id, label: renameLabel.value.trim() })
  }
  renamingTabId.value = null
}

const cancelRename = () => {
  renamingTabId.value = null
}

const handleDelete = (id: string) => {
  emit('delete-tab', id)
  activeMenuTabId.value = null
}

const toggleMenu = (id: string) => {
  activeMenuTabId.value = activeMenuTabId.value === id ? null : id
}

// Outline headings logic
const outlineHeadings = ref<Array<{ id: string; text: string; level: number; pos: number }>>([])

const updateOutline = () => {
  if (!props.editor) return
  const list: Array<{ id: string; text: string; level: number; pos: number }> = []
  props.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level
      if (level === 1 || level === 2 || level === 3) {
        list.push({
          id: `heading-${pos}`,
          text: node.textContent.trim() || t('documentTabs.untitledHeading').replace('{level}', String(level)),
          level,
          pos,
        })
      }
    }
    return true
  })
  outlineHeadings.value = list
}

let cleanupEditorListener: (() => void) | null = null

watch(
  () => props.editor,
  (editor) => {
    if (cleanupEditorListener) {
      cleanupEditorListener()
      cleanupEditorListener = null
    }
    if (!editor) {
      outlineHeadings.value = []
      return
    }

    updateOutline()

    const handler = () => {
      updateOutline()
    }
    editor.on('update', handler)
    cleanupEditorListener = () => {
      editor.off('update', handler)
    }
  },
  { immediate: true }
)

const scrollToHeading = (heading: { text: string; pos: number }) => {
  if (!props.editor) return
  props.editor.chain().focus().setTextSelection(heading.pos).run()

  setTimeout(() => {
    const scrollContainer = document.querySelector('.docs-editor-scroll')
    if (!scrollContainer) return
    const headings = scrollContainer.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3')
    for (const el of Array.from(headings)) {
      if (el.textContent?.trim() === heading.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
  }, 50)
}
</script>

<template>
  <aside class="docs-editor-left-sidebar flex w-14 flex-shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50/50 py-3 dark:border-slate-800 dark:bg-[#080d1a] md:w-64 md:items-stretch md:px-3">
    <!-- Close / Collapse Sidebar button -->
    <div class="mb-4 flex items-center justify-between px-1">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-800/80"
        :title="effectiveBackTitle"
        @click="emit('collapse')"
      >
        <ArrowLeft class="h-[18px] w-[18px]" />
      </button>
    </div>

    <!-- Main Sidebar Content for Medium and Up screens -->
    <div class="hidden flex-col gap-4 md:flex">
      <!-- Sidebar Section Header: Tab Dokumen -->
      <div class="flex items-center justify-between px-2">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{{ t('documentTabs.documentTabs') }}</span>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          :title="t('documentTabs.addTab')"
          @click="emit('add-tab')"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>

      <!-- Tab Items List -->
      <div class="flex flex-col gap-1 pr-1">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="group relative flex w-full items-center justify-between rounded-r-full py-1.5 pl-3 pr-2 text-left text-sm transition-all"
          :class="[
            tab.active
              ? 'bg-[#c2e7ff]/70 text-[#001d35] dark:bg-blue-950/40 dark:text-blue-200 font-medium'
              : 'text-slate-700 hover:bg-slate-200/40 dark:text-slate-300 dark:hover:bg-slate-800/30'
          ]"
        >
          <!-- Switch tab content action area (only shown when not renaming) -->
          <button
            v-if="renamingTabId !== tab.id"
            type="button"
            class="flex flex-1 items-center gap-2 truncate pr-6 text-left"
            @click="emit('select-tab', tab.id)"
          >
            <FileText class="h-4 w-4 flex-shrink-0 opacity-70" />
            <span class="truncate">{{ tab.label }}</span>
          </button>

          <!-- Inline rename input (sibling, not nested inside button) -->
          <div v-if="renamingTabId === tab.id" class="flex flex-1 items-center gap-2 pr-6">
            <FileText class="h-4 w-4 flex-shrink-0 opacity-70" />
            <input
              v-model="renameLabel"
              type="text"
              class="flex-1 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-400/50 dark:bg-slate-900 dark:text-slate-100"
              @blur="saveRename(tab.id)"
              @keydown.enter="saveRename(tab.id)"
              @keydown.esc="cancelRename"
              @click.stop
            />
          </div>

          <!-- Tab Action Menu Trigger -->
          <div class="relative flex items-center">
            <button
              v-if="renamingTabId !== tab.id"
              type="button"
              class="rounded-full p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-200/70 group-hover:opacity-100 dark:hover:bg-slate-700/70"
              :class="{ 'opacity-100': activeMenuTabId === tab.id }"
              @click.stop="toggleMenu(tab.id)"
            >
              <MoreVertical class="h-3.5 w-3.5" />
            </button>

            <!-- Dropdown menu -->
            <div
              v-if="activeMenuTabId === tab.id"
              class="absolute right-0 top-6 z-50 w-28 rounded-lg border border-slate-200/80 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <button
                type="button"
                class="flex w-full items-center px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50"
                @click.stop="startRename(tab)"
              >
                {{ t('documentTabs.rename') }}
              </button>
              <button
                type="button"
                class="flex w-full items-center px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 disabled:opacity-40"
                :disabled="tabs.length <= 1"
                @click.stop="handleDelete(tab.id)"
              >
                {{ t('documentTabs.delete') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider line -->
      <div class="h-px bg-slate-200/80 dark:bg-slate-800 mx-2" />

      <!-- Outline / Heading list -->
      <div class="flex flex-col gap-1.5 px-2">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{{ t('documentTabs.outline') }}</span>
        
        <!-- outline headings list -->
        <div v-if="outlineHeadings.length > 0" class="flex flex-col gap-1 mt-1">
          <button
            v-for="heading in outlineHeadings"
            :key="heading.id"
            type="button"
            class="w-full text-left text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 py-1 transition-colors truncate"
            :class="[
              heading.level === 2 ? 'pl-3' : '',
              heading.level === 3 ? 'pl-6' : '',
            ]"
            @click="scrollToHeading(heading)"
          >
            {{ heading.text }}
          </button>
        </div>

        <!-- outline placeholder -->
        <p v-else class="text-xs leading-relaxed text-slate-400 dark:text-slate-500 italic mt-1 font-sans">
          {{ t('documentTabs.placeholder') }}
        </p>
      </div>
    </div>

    <!-- Small screen/collapsed icons sidebar -->
    <div class="flex flex-col gap-2 md:hidden">
      <button
        v-for="tab in props.tabs"
        :key="tab.id"
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
        :class="[
          tab.active
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
            : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'
        ]"
        :title="tab.label"
        @click="emit('select-tab', tab.id)"
      >
        <FileText class="h-4 w-4" />
      </button>
    </div>
  </aside>
</template>
