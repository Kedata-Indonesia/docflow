<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { useLocale } from '../composables/useLocale.js'

const { t } = useLocale()

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
  position.value = {
    top: coords.bottom + 4,
    left: coords.left,
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

function onSelectionUpdate() {
  if (visible.value) updatePosition()
}

// The keydown listener must run in the CAPTURE phase on the editor element.
// ProseMirror registers its own keydown handler on `view.dom` (bubble), so a
// document-level bubble listener runs *after* ProseMirror has already handled
// Enter/ArrowUp/ArrowDown. The resulting transaction fires the editor `update`
// event, which calls `onTextInput` and closes the menu — before the menu ever
// sees the key. Capturing on `view.dom` lets us intercept first.
let editorDom: HTMLElement | null = null

watch(() => props.editor, (ed, _prev, onCleanup) => {
  if (!ed) return
  ed.on('update', onTextInput)
  ed.on('selectionUpdate', onSelectionUpdate)
  editorDom = ed.view.dom
  editorDom.addEventListener('keydown', onKeyDown, true)
  onCleanup(() => {
    if (editorDom) editorDom.removeEventListener('keydown', onKeyDown, true)
    editorDom = null
    ed.off('update', onTextInput)
    ed.off('selectionUpdate', onSelectionUpdate)
  })
}, { immediate: true })

// `immediate` so the full command list is populated as soon as the menu opens
// on a bare '/': otherwise `filteredCommands` stays empty (the watcher only
// fires when `query` changes) and the menu's `length > 0` guard hides it until
// the user types a query character.
watch([query, () => props.commands], () => {
  const q = query.value.toLowerCase()
  filteredCommands.value = q
    ? props.commands.filter(c => c.name.toLowerCase().includes(q))
    : props.commands
  // Keep the highlight inside the new list: `props.commands` can shrink while the
  // query stays the same, which would leave Enter silently selecting nothing.
  selectedIndex.value = Math.min(selectedIndex.value, Math.max(filteredCommands.value.length - 1, 0))
}, { immediate: true })

const isMenuOpen = () => visible.value && filteredCommands.value.length > 0

function onKeyDown(e: KeyboardEvent) {
  // `visible` alone is not enough: with no matches (`/zzz`) the template hides
  // the menu, so there is nothing to navigate and the keys must reach
  // ProseMirror instead of being swallowed.
  if (!isMenuOpen()) return
  // Never steal the Enter that confirms an IME composition.
  if (e.isComposing || e.keyCode === 229) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredCommands.value.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    return
  }
  // Only a bare Enter activates a command; modifier combos (Shift+Enter,
  // Ctrl/Cmd+Enter, …) belong to the editor.
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    e.stopPropagation()
    const cmd = filteredCommands.value[selectedIndex.value]
    if (cmd) selectCommand(cmd)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && filteredCommands.length > 0"
      class="docs-slash-menu fixed z-[999] w-56 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
      :style="{ top: position.top + 'px', left: position.left + 'px' }"
    >
      <div class="px-2 py-1.5 text-[10px] font-semibold uppercase text-slate-400">{{ t('slashMenu.basicBlocks') }}</div>
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
