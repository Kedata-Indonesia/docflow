<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, watch, onUnmounted } from 'vue'
import { Bold, Italic, Underline, Link as LinkIcon, Sparkles, Check, X, Loader2, AlertCircle } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'
import type { AIAction } from '@kedata-indonesia/docflow-core'

export interface BubbleMenuPosition {
  top: number
  left: number
}

interface AIPreviewLike {
  status: 'streaming' | 'done' | 'error'
  text: string
  error?: string
}

const props = defineProps<{
  visible?: boolean
  actions: Record<string, (...args: unknown[]) => boolean>
  position?: BubbleMenuPosition | null
  editor?: Editor | null
}>()

const selectionTick = ref(0)
const showAISubmenu = ref(false)

function handleTransaction() {
  selectionTick.value++
}

watch(
  () => props.editor,
  (newEditor, oldEditor) => {
    if (oldEditor) {
      oldEditor.off('transaction', handleTransaction)
    }
    if (newEditor) {
      newEditor.on('transaction', handleTransaction)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (props.editor) {
    props.editor.off('transaction', handleTransaction)
  }
})

// Close the AI submenu whenever the selection/preview state changes.
watch(selectionTick, () => {
  showAISubmenu.value = false
})

const items = computed(() => {
  // Establish reactive dependency
  void selectionTick.value
  return [
    { id: 'bold', label: 'Bold', action: 'toggleBold', icon: Bold, active: props.editor?.isActive('bold') },
    { id: 'italic', label: 'Italic', action: 'toggleItalic', icon: Italic, active: props.editor?.isActive('italic') },
    { id: 'underline', label: 'Underline', action: 'toggleUnderline', icon: Underline, active: props.editor?.isActive('underline') },
    { id: 'link', label: 'Link', action: 'setLink', icon: LinkIcon, active: props.editor?.isActive('link') },
  ]
})

// ─── AI (Phase 7B) ────────────────────────────────────────────────────────────

/** The host injected an aiStream port (apps/web) — hide AI actions otherwise. */
const aiAvailable = computed(() => {
  void selectionTick.value
  return Boolean((props.editor?.storage as any)?.editorContext?.aiStream)
})

/** Active AI preview mirrored into extension storage by the aiPlugin. */
const aiPreview = computed<AIPreviewLike | null>(() => {
  void selectionTick.value
  return ((props.editor?.storage as any)?.ai?.preview ?? null) as AIPreviewLike | null
})

const aiActions: Array<{ id: string; label: string; action: AIAction; prompt?: string }> = [
  { id: 'rewrite', label: 'Rewrite', action: 'rewrite' },
  { id: 'summarize', label: 'Summarize', action: 'summarize' },
  { id: 'grammar', label: 'Fix grammar', action: 'grammar' },
  { id: 'tone', label: 'Make formal', action: 'tone', prompt: 'make it more formal' },
  { id: 'translate', label: 'Translate to English', action: 'translate', prompt: 'translate to English' },
  { id: 'expand', label: 'Expand', action: 'expand' },
  { id: 'shorten', label: 'Shorten', action: 'shorten' },
]

// The aiPlugin (docflow-plugins) registers these commands via module
// augmentation; docflow-vue doesn't depend on that package, so type them
// structurally here (mirrors how citation storage is read with casts).
interface AICommandSet {
  aiTransform: (options: { action: AIAction; prompt?: string }) => boolean
  aiAccept: () => boolean
  aiReject: () => boolean
}

function aiCommands(): AICommandSet | null {
  return (props.editor?.commands ?? null) as unknown as AICommandSet | null
}

function runAIAction(item: (typeof aiActions)[number]) {
  showAISubmenu.value = false
  aiCommands()?.aiTransform({ action: item.action, ...(item.prompt ? { prompt: item.prompt } : {}) })
}

function acceptAI() {
  aiCommands()?.aiAccept()
}

function rejectAI() {
  aiCommands()?.aiReject()
}

const menuStyle = computed(() => {
  if (!props.position) return {}
  return {
    top: `${props.position.top}px`,
    left: `${props.position.left}px`,
  }
})

const activeClass = 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-bold'
const inactiveClass =
  'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'

function runAction(action: string) {
  if (action === 'setLink') {
    if (props.editor?.isActive('link')) {
      (props.editor.chain().focus() as any).unsetLink().run()
      return
    }
    const url = typeof window !== 'undefined' ? window.prompt('Enter link URL:', 'https://') : null
    if (url) {
      const fn = props.actions[action]
      if (typeof fn === 'function') fn({ href: url, target: '_blank' })
      else (props.editor?.chain().focus() as any).setLink?.({ href: url, target: '_blank' }).run()
    }
    return
  }

  const fn = props.actions[action]
  if (typeof fn === 'function') {
    fn()
  } else if (props.editor) {
    const chain = props.editor.chain().focus() as unknown as Record<string, () => { run: () => boolean }>
    chain[action]?.().run()
  }
}
</script>

<template>
  <div
    v-if="visible"
    data-testid="bubble-menu"
    class="docs-editor-bubble-menu fixed z-50 flex gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-[#0c1329]"
    :style="menuStyle"
    @mousedown.prevent
  >
    <!-- AI preview active: status + accept/reject (7B-3) -->
    <template v-if="aiPreview">
      <span
        v-if="aiPreview.status === 'streaming'"
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-cyan-600 dark:text-cyan-400"
      >
        <Loader2 class="h-3.5 w-3.5 animate-spin" />
        <span>AI writing…</span>
      </span>
      <span
        v-else-if="aiPreview.status === 'error'"
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400"
        :title="aiPreview.error"
      >
        <AlertCircle class="h-3.5 w-3.5" />
        <span>AI error</span>
      </span>
      <button
        type="button"
        :disabled="aiPreview.status === 'streaming'"
        :class="[
          'docs-editor-bubble-menu__button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
          aiPreview.status === 'streaming'
            ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
            : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10',
        ]"
        title="Accept (Enter)"
        @click="acceptAI"
      >
        <Check class="h-3.5 w-3.5" />
        <span>Accept</span>
      </button>
      <button
        type="button"
        :class="[
          'docs-editor-bubble-menu__button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
          'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
        ]"
        title="Reject (Esc)"
        @click="rejectAI"
      >
        <X class="h-3.5 w-3.5" />
        <span>Reject</span>
      </button>
    </template>

    <!-- Normal selection actions + AI submenu -->
    <template v-else>
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        :class="[
          'docs-editor-bubble-menu__button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
          item.active ? activeClass : inactiveClass,
        ]"
        @click="runAction(item.action)"
      >
        <component :is="item.icon" class="h-3.5 w-3.5" />
        <span>{{ item.label }}</span>
      </button>

      <div v-if="aiAvailable" class="relative">
        <button
          type="button"
          :class="[
            'docs-editor-bubble-menu__button flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
            showAISubmenu ? activeClass : 'text-cyan-600 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10',
          ]"
          @click="showAISubmenu = !showAISubmenu"
        >
          <Sparkles class="h-3.5 w-3.5" />
          <span>AI</span>
        </button>
        <div
          v-if="showAISubmenu"
          class="absolute left-0 top-full z-10 mt-1 flex min-w-44 flex-col rounded-xl border border-slate-200 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-[#0c1329]"
        >
          <button
            v-for="item in aiActions"
            :key="item.id"
            type="button"
            class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
            @click="runAIAction(item)"
          >
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.docs-editor-bubble-menu {
  transform: translateX(-50%);
}

.docs-editor-bubble-menu::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px;
  border-style: solid;
  border-color: white transparent transparent transparent;
}

.dark .docs-editor-bubble-menu::after {
  border-color: #0c1329 transparent transparent transparent;
}
</style>
