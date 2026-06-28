<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
import { computed, ref, watch, onUnmounted } from 'vue'
import { Bold, Italic, Underline, Link as LinkIcon } from 'lucide-vue-next'
import type { Editor } from '@tiptap/core'

export interface BubbleMenuPosition {
  top: number
  left: number
}

const props = defineProps<{
  visible?: boolean
  actions: Record<string, (...args: unknown[]) => boolean>
  position?: BubbleMenuPosition | null
  editor?: Editor | null
}>()

const selectionTick = ref(0)

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
