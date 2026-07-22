<script setup lang="ts">
import { ref, watch } from 'vue'
import { Link2, Trash2, X } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  initialText?: string
  initialUrl?: string
  isEditing?: boolean
}>()

const emit = defineEmits<{
  apply: [payload: { text: string; url: string }]
  remove: []
  close: []
}>()

const text = ref('')
const url = ref('')
const error = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      text.value = props.initialText ?? ''
      url.value = props.initialUrl ?? 'https://'
      error.value = ''
    }
  },
)

function validate(): boolean {
  const trimmed = url.value.trim()
  if (!trimmed) {
    error.value = t('editor.linkDialog.urlRequired')
    return false
  }
  // Allow relative URLs, anchors, and mailto without scheme
  if (/^(\/|#|mailto:|tel:)/.test(trimmed)) {
    error.value = ''
    return true
  }
  try {
    new URL(trimmed)
    error.value = ''
    return true
  } catch {
    error.value = t('editor.linkDialog.urlInvalid')
    return false
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (/^(\/|#|mailto:|tel:)/.test(trimmed)) return trimmed
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

function apply() {
  if (!validate()) return
  emit('apply', {
    text: text.value.trim(),
    url: normalizeUrl(url.value),
  })
}

function remove() {
  emit('remove')
}

function close() {
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @click.self="close"
    @keydown="handleKeydown"
  >
    <div class="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
          <Link2 class="h-5 w-5 text-slate-500 dark:text-slate-400" />
          {{ isEditing ? t('editor.linkDialog.editTitle') : t('editor.linkDialog.insertTitle') }}
        </h3>
        <button
          type="button"
          class="rounded-md p-1 text-sm text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mb-4">
        <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          {{ t('editor.linkDialog.text') }}
        </label>
        <input
          v-model="text"
          type="text"
          :placeholder="t('editor.linkDialog.textPlaceholder')"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
          @keydown.enter="apply"
        />
      </div>

      <div class="mb-2">
        <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          {{ t('editor.linkDialog.url') }}
        </label>
        <input
          v-model="url"
          type="text"
          :placeholder="t('editor.linkDialog.urlPlaceholder')"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
          @keydown.enter="apply"
        />
        <p v-if="error" class="mt-1 text-[11px] text-red-600 dark:text-red-400">{{ error }}</p>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <button
          v-if="isEditing"
          type="button"
          class="mr-auto flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          @click="remove"
        >
          <Trash2 class="h-3.5 w-3.5" />
          {{ t('editor.linkDialog.remove') }}
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          @click="close"
        >
          {{ t('editor.linkDialog.cancel') }}
        </button>
        <button
          type="button"
          class="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-cyan-700"
          @click="apply"
        >
          {{ isEditing ? t('editor.linkDialog.update') : t('editor.linkDialog.insert') }}
        </button>
      </div>
    </div>
  </div>
</template>
