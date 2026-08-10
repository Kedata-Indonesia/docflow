<script setup lang="ts">
import { ref } from 'vue'
import { ThemeToggle, provideLocale } from '@kedata-indonesia/docflow-vue'
import EditorView from './components/EditorView.vue'

/**
 * DocsEditor demo — a thin, backend-free library showcase.
 * For the real product (auth, dashboard, sharing), see apps/web.
 * This app mounts <DocsEditor> with defaultPlugins over an in-memory document
 * with webrtc (P2P/local) collaboration. No server required: `pnpm dev`.
 */
provideLocale()

interface DemoTemplate {
  id: string
  label: string
  title: string
  content: object
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

const LETTER_DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '[Your Name]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[Your Address]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[City, State ZIP]' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: '[Date]' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: '[Recipient Name]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[Recipient Title]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[Company Name]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[Company Address]' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'Subject: [Subject]' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'Dear [Recipient Name],' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'Sincerely,' }] },
    { type: 'paragraph' },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: '[Your Name]' }] },
  ],
}

const templates: DemoTemplate[] = [
  { id: 'blank', label: 'Blank document', title: 'Untitled Document', content: EMPTY_DOC },
  { id: 'letter', label: 'Official letter', title: 'Official Letter', content: LETTER_DOC },
]

const activeTemplateId = ref(templates[0].id)
const title = ref(templates[0].title)
const content = ref<object>(templates[0].content)
const starred = ref(false)

function pickTemplate(tpl: DemoTemplate) {
  activeTemplateId.value = tpl.id
  title.value = tpl.title
  content.value = tpl.content
  starred.value = false
}
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-100 dark:bg-[#02040a]">
    <!-- Showcase bar: template picker + theme toggle -->
    <div class="flex h-10 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-[#0b1120]">
      <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
        DocsEditor — library showcase (backend-free)
      </span>
      <div class="flex items-center gap-1.5">
        <button
          v-for="tpl in templates"
          :key="tpl.id"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
          :class="activeTemplateId === tpl.id
            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
            : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'"
          @click="pickTemplate(tpl)"
        >
          {{ tpl.label }}
        </button>
        <div class="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
        <ThemeToggle />
      </div>
    </div>

    <!-- The showcase itself. Remounts when the template changes. -->
    <EditorView
      :key="activeTemplateId"
      :title="title"
      :content="content"
      :starred="starred"
      @update:title="title = $event"
      @update:content="content = $event"
      @toggle-star="starred = !starred"
    />
  </div>
</template>
