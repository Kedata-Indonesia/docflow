<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import {
  List,
  X,
  Search,
  ChevronRight,
  Hash,
  Plus,
  Navigation2,
} from 'lucide-vue-next'

interface HeadingItem {
  id: string
  text: string
  level: number
  pos: number
}

const props = defineProps<{
  editor?: Editor | null
}>()

const emit = defineEmits<{
  close: []
}>()

const headings = ref<HeadingItem[]>([])
const searchQuery = ref('')
const activeHeadingId = ref<string | null>(null)

function refreshHeadings() {
  if (!props.editor) return
  const items: HeadingItem[] = []
  props.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number
      if (level === 1 || level === 2 || level === 3) {
        const text = node.textContent.trim()
        items.push({
          id: `heading-${pos}`,
          text: text || `Untitled Heading ${level}`,
          level,
          pos,
        })
      }
    }
    return true
  })
  headings.value = items
}

onMounted(refreshHeadings)
watch(() => props.editor, refreshHeadings)

const filteredHeadings = computed(() =>
  headings.value.filter((h) =>
    h.text.toLowerCase().includes(searchQuery.value.toLowerCase()),
  ),
)

function handleJumpToHeading(heading: HeadingItem) {
  if (!props.editor) return
  props.editor.chain().focus().setTextSelection(heading.pos).run()
  activeHeadingId.value = heading.id
  setTimeout(() => {
    const scrollContainer = document.querySelector('.docs-editor-scroll')
    if (!scrollContainer) return
    const els = scrollContainer.querySelectorAll(
      '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3',
    )
    for (const el of Array.from(els)) {
      if (el.textContent?.trim() === heading.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
  }, 50)
}

function handleInsertHeading(level: 1 | 2 | 3) {
  if (!props.editor) return
  const tag = level === 1 ? 'Heading 1' : level === 2 ? 'Heading 2' : 'Heading 3'
  props.editor.chain().focus().insertContent(`<h${level}>New ${tag} Section</h${level}><p>Start writing here...</p>`).run()
}

function headingClasses(level: number, isActive: boolean) {
  const base = 'group w-full flex items-center justify-between rounded-lg p-1.5 text-left transition-all relative'
  const active = 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
  const inactive = 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
  if (level === 1) return [base, isActive ? active : inactive, 'pl-0 font-bold text-xs text-slate-800 dark:text-slate-200']
  if (level === 2) return [base, isActive ? active : inactive, 'pl-3.5 font-semibold text-[11px] text-slate-600 dark:text-slate-300']
  return [base, isActive ? active : inactive, 'pl-6 text-[10px] text-slate-400 dark:text-slate-400']
}

function dotColor(level: number) {
  if (level === 1) return 'bg-cyan-500'
  if (level === 2) return 'bg-emerald-500'
  return 'bg-amber-500'
}
</script>

<template>
  <div class="toc-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all animate-fadeIn dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <div class="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/5">
      <div>
        <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <List class="h-4 w-4 text-cyan-500" /> Table of Contents
        </h3>
        <p class="mt-1 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">Outline of headers in this document.</p>
      </div>
      <button
        type="button"
        class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-white"
        title="Close outline"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div v-if="headings.length > 0" class="px-4 pb-2 pt-3">
      <div class="relative flex items-center">
        <Search class="absolute left-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search headings..."
          class="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-2 pl-9 pr-8 text-xs text-slate-700 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/50 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200 dark:focus:ring-cyan-400/30"
        >
        <button
          v-if="searchQuery"
          type="button"
          class="absolute right-2.5 rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
          @click="searchQuery = ''"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>

    <div class="custom-scrollbar flex-1 overflow-y-auto p-4">
      <div v-if="headings.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <div class="mb-3 rounded-full bg-cyan-500/10 p-3 text-cyan-500 dark:bg-cyan-400/5">
          <List class="h-6 w-6" />
        </div>
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">No Headings Yet</h4>
        <p class="mt-1.5 max-w-[200px] text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">Use headers (H1, H2, or H3) to structure your document. An interactive outline will generate here automatically.</p>

        <div class="mt-5 w-full space-y-2 px-4 font-sans">
          <span class="mb-1.5 block text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Quick Insert:</span>
          <button
            v-for="level in ([1, 2, 3] as const)"
            :key="level"
            type="button"
            class="flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700 transition-all hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/5"
            @click="handleInsertHeading(level)"
          >
            <span class="flex items-center gap-1.5">
              <Hash class="h-3 w-3" :class="level === 1 ? 'text-cyan-500' : level === 2 ? 'text-emerald-500' : 'text-amber-500'" />
              Heading {{ level }}
            </span>
            <Plus class="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      <div v-else-if="filteredHeadings.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-slate-400">
        <Search class="mb-2 h-5 w-5 text-slate-300" />
        <p class="text-xs font-semibold">No matching headers found</p>
        <p class="mt-1 text-[10px] text-slate-400">Try searching with a different term.</p>
      </div>

      <div v-else class="space-y-1 font-sans">
        <span class="mb-2.5 block text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Outline Layout</span>
        <div class="relative ml-1.5 space-y-1.5 border-l border-slate-100 pl-1.5 dark:border-white/5">
          <button
            v-for="heading in filteredHeadings"
            :key="heading.id"
            type="button"
            :class="headingClasses(heading.level, activeHeadingId === heading.id)"
            @click="handleJumpToHeading(heading)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <span
                class="h-1.5 w-1.5 shrink-0 rounded-full transition-all"
                :class="[dotColor(heading.level), activeHeadingId === heading.id ? 'scale-125 opacity-100' : 'opacity-40 group-hover:scale-110 group-hover:opacity-100']"
              />
              <span class="flex-1 truncate leading-tight" :class="activeHeadingId === heading.id ? 'text-cyan-600 dark:text-cyan-400' : ''">
                {{ heading.text }}
              </span>
            </div>
            <ChevronRight
              class="h-3 w-3 shrink-0 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100"
              :class="activeHeadingId === heading.id ? 'opacity-100 text-cyan-600 dark:text-cyan-400' : ''"
            />
          </button>
        </div>
      </div>
    </div>

    <div class="border-t border-slate-200 bg-slate-50/50 p-3.5 text-[10px] leading-relaxed text-slate-400 dark:border-white/5 dark:bg-slate-900/30 dark:text-slate-500">
      <div class="flex items-start gap-1.5">
        <Navigation2 class="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500" />
        <p>Outline syncs automatically. Click any header to instantly jump, focus, and scroll the editor to that section.</p>
      </div>
    </div>
  </div>
</template>
