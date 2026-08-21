<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Mail, Link2 } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale.js'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  documentTitle: string
  shareUrl: string
  defaultRecipient?: string
}>()

const emit = defineEmits<{
  close: []
  'copy-link': []
}>()

const to = ref(props.defaultRecipient || '')
const subject = ref('')
const body = ref('')
const subjectFocused = ref(false)
const bodyFocused = ref(false)

const defaultSubject = computed(() => t('editor.email.defaultSubject', { title: props.documentTitle }))
const defaultBody = computed(() => t('editor.email.defaultBody', { url: props.shareUrl }))

const isDefaultSubject = computed(() => subject.value === defaultSubject.value)
const isDefaultBody = computed(() => body.value === defaultBody.value)

watch(() => props.documentTitle, () => {
  subject.value = defaultSubject.value
}, { immediate: true })

watch(() => props.shareUrl, () => {
  body.value = defaultBody.value
}, { immediate: true })

const mailtoHref = computed(() => {
  const params = new URLSearchParams()
  if (subject.value.trim()) params.set('subject', subject.value.trim())
  if (body.value.trim()) params.set('body', body.value.trim())
  const query = params.toString()
  let href = `mailto:${to.value.trim()}`
  if (query) href += `?${query}`
  return href
})

function handleCopyLink() {
  emit('copy-link')
}

function reset() {
  to.value = props.defaultRecipient || ''
  subject.value = defaultSubject.value
  body.value = defaultBody.value
  subjectFocused.value = false
  bodyFocused.value = false
}

watch(() => props.isOpen, (open) => {
  if (open) reset()
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525]">
      <div class="mb-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Mail class="h-4 w-4" />
          </div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">
            {{ t('editor.email.title') }}
          </h2>
        </div>
        <button
          type="button"
          class="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/50 dark:bg-white/5">
        <label class="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {{ t('editor.email.shareableLink') }}
        </label>
        <div class="flex items-center gap-2">
          <input
            type="text"
            :value="shareUrl"
            readonly
            class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
          />
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-500 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
            :title="t('editor.email.copyLink')"
            @click="handleCopyLink"
          >
            <Link2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {{ t('editor.email.to') }}
          </label>
          <input
            v-model="to"
            type="email"
            class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            :placeholder="t('editor.email.toPlaceholder')"
          />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {{ t('editor.email.subject') }}
          </label>
          <input
            v-model="subject"
            type="text"
            :class="[
              'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900',
              isDefaultSubject && !subjectFocused
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-slate-700 dark:text-slate-300',
            ]"
            @focus="subjectFocused = true"
            @blur="subjectFocused = false"
          />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {{ t('editor.email.body') }}
          </label>
          <textarea
            v-model="body"
            rows="4"
            :class="[
              'w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-xs focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900',
              isDefaultBody && !bodyFocused
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-slate-700 dark:text-slate-300',
            ]"
            @focus="bodyFocused = true"
            @blur="bodyFocused = false"
          />
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-300"
          @click="emit('close')"
        >
          {{ t('common.cancel') }}
        </button>
        <a
          :href="mailtoHref"
          class="inline-flex rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700"
          @click="emit('close')"
        >
          {{ t('editor.email.send') }}
        </a>
      </div>
    </div>
  </div>
</template>
