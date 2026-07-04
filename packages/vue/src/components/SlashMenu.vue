<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor | null
  commands: Array<{ name: string; command: string }>
}>()

const visible = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const position = ref({ top: 0, left: 0 })

const filteredCommands = ref<Array<{ name: string; command: string }>>([])

function updatePosition() {
  if (!props.editor) return
  const { view } = props.editor
  const { selection } = view.state
  const coords = view.coordsAtPos(selection.head)
  const editorRect = view.dom.getBoundingClientRect()
  position.value = {
    top: coords.bottom - editorRect.top + 4,
    left: coords.left - editorRect.left,
  }
}

function selectCommand(cmd: { name: string; command: string }) {
  if (!props.editor) return

  // Delete the '/' and query text
  const { view } = props.editor
  const { selection } = view.state
  const pos = selection.head
  const $pos = view.state.doc.resolve(pos)
  const lineStart = $pos.start()
  const text = $pos.parent.textContent.slice(0, $pos.parentOffset)
  const slashIdx = text.lastIndexOf('/')
  if (slashIdx >= 0) {
    const from = lineStart + slashIdx
    const tr = view.state.tr.delete(from, pos)
    view.dispatch(tr)
  }

  // Execute the command
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorAny = props.editor as any
  if (typeof editorAny.commands?.[cmd.command] === 'function') {
    editorAny.commands[cmd.command]()
  } else if (editorAny.chain) {
    // Try TipTap chain
    try {
      editorAny.chain().focus()[cmd.command]?.()?.run()
    } catch { /* ignore */ }
  }

  visible.value = false
  query.value = ''
}

function close() {
  visible.value = false
  query.value = ''
}

// Listen for '/' typing
function onTextInput() {
  if (!props.editor) return
  const { view } = props.editor
  const { selection } = view.state
  const pos = selection.head
  const $pos = view.state.doc.resolve(pos)
  const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset)

  const slashIdx = textBefore.lastIndexOf('/')
  if (slashIdx >= 0) {
    const beforeSlash = textBefore.slice(0, slashIdx)
    const afterSlash = textBefore.slice(slashIdx + 1)

    // '/' must be at start of line or after space
    if (beforeSlash === '' || beforeSlash.endsWith(' ') || beforeSlash === '\n') {
      // No spaces in query
      if (!afterSlash.includes(' ')) {
        query.value = afterSlash
        visible.value = true
        selectedIndex.value = 0
        updatePosition()
        return
      }
    }
  }

  visible.value = false
}

watch(() => props.editor, (ed) => {
  if (ed) {
    ed.on('update', onTextInput)
    ed.on('selectionUpdate', () => {
      if (visible.value) updatePosition()
    })
  }
})

watch([query, () => props.commands], () => {
  const q = query.value.toLowerCase()
  filteredCommands.value = q
    ? props.commands.filter(c => c.name.toLowerCase().includes(q))
    : props.commands
})

function onKeyDown(e: KeyboardEvent) {
  if (!visible.value) return
  if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex.value = Math.min(selectedIndex.value + 1, filteredCommands.value.length - 1) }
  if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex.value = Math.max(selectedIndex.value - 1, 0) }
  if (e.key === 'Enter') { e.preventDefault(); const cmd = filteredCommands.value[selectedIndex.value]; if (cmd) selectCommand(cmd) }
  if (e.key === 'Escape') { e.preventDefault(); close() }
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && filteredCommands.length > 0"
      class="docs-slash-menu fixed z-[999] w-56 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
      :style="{ top: position.top + 'px', left: position.left + 'px' }"
    >
      <div class="px-2 py-1.5 text-[10px] font-semibold uppercase text-slate-400">Basic Blocks</div>
      <button
        v-for="(cmd, i) in filteredCommands"
        :key="cmd.command"
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
        :class="i === selectedIndex ? 'bg-slate-100 dark:bg-slate-700' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'"
        @click="selectCommand(cmd)"
        @mouseenter="selectedIndex = i"
      >
        <span class="text-slate-500 dark:text-slate-400">{{ cmd.name }}</span>
      </button>
    </div>
  </Teleport>
</template>
