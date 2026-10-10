<script setup lang="ts">
import { ref } from 'vue'
import type { ConnectionState, Locale } from '@kedata-indonesia/docflow-vue'
import { PAGE_SIZE_OPTIONS, type PresetId } from './sampleData'

/**
 * Review surface for the playground. Every control maps 1:1 to a public
 * `<DocsEditor>` prop, so what you toggle here is exactly what a consumer can
 * toggle from the host app.
 */
const open = ref(true)

const presetId = defineModel<PresetId>('presetId', { required: true })
const title = defineModel<string>('title', { required: true })
const pageSize = defineModel<string>('pageSize', { required: true })
const orientation = defineModel<'portrait' | 'landscape'>('orientation', { required: true })
const pageless = defineModel<boolean>('pageless', { required: true })
const virtualPages = defineModel<boolean>('virtualPages', { required: true })
const editable = defineModel<boolean>('editable', { required: true })
const debug = defineModel<boolean>('debug', { required: true })
const locale = defineModel<Locale>('locale', { required: true })
const userName = defineModel<string>('userName', { required: true })
const connectionState = defineModel<ConnectionState>('connectionState', { required: true })
// Playground-only: swap the built-in references sidebar for a host component
// injected through DocsEditor's `#references-sidebar` slot (issue #22).
const customReferencesSidebar = defineModel<boolean>('customReferencesSidebar', { required: true })

defineProps<{ commentCount: number; snapshotCount: number }>()

const emit = defineEmits<{ 'add-comment-sample': []; 'add-snapshot-sample': [] }>()

const CONNECTION_OPTIONS: ConnectionState[] = ['connected', 'connecting', 'disconnected']
</script>

<template>
  <section class="pg-card pg-panel" :class="{ 'pg-panel--closed': !open }">
    <header class="pg-card__head">
      <button
        class="pg-btn pg-btn--ghost"
        type="button"
        :title="open ? 'Hide panel' : 'Show panel'"
        @click="open = !open"
      >
        {{ open ? '▾' : '▸' }}
      </button>
      <span class="pg-card__title">Playground</span>
      <span class="pg-badge">public API</span>
    </header>

    <div v-if="open" class="pg-card__body">
      <p class="pg-section">Document</p>
      <label class="pg-field">
        <span class="pg-field__label">Sample document</span>
        <select v-model="presetId" class="pg-input pg-select">
          <option value="blank">Blank document</option>
          <option value="letter">Meeting invitation letter</option>
          <option value="contract">Cooperation agreement</option>
          <option value="report">Monthly report</option>
          <option value="long">Long report + footnotes (#19)</option>
        </select>
      </label>
      <label class="pg-field">
        <span class="pg-field__label">Title <code>title</code></span>
        <input v-model="title" class="pg-input" type="text" />
      </label>
      <label class="pg-field">
        <span class="pg-field__label">Author <code>userName</code></span>
        <input v-model="userName" class="pg-input" type="text" />
      </label>

      <p class="pg-section">Layout</p>
      <label class="pg-field">
        <span class="pg-field__label">Page size <code>pageSize</code></span>
        <select v-model="pageSize" class="pg-input pg-select">
          <option v-for="size in PAGE_SIZE_OPTIONS" :key="size.id" :value="size.id">{{ size.label }}</option>
        </select>
      </label>
      <label class="pg-field">
        <span class="pg-field__label">Orientation <code>orientation</code></span>
        <select v-model="orientation" class="pg-input pg-select">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label class="pg-check"><input v-model="pageless" type="checkbox" /><span>pageless</span></label>
      <label class="pg-check"><input v-model="virtualPages" type="checkbox" /><span>virtualPages</span></label>

      <p class="pg-section">Behaviour</p>
      <label class="pg-check"><input v-model="editable" type="checkbox" /><span>editable</span></label>
      <label class="pg-check"><input v-model="debug" type="checkbox" /><span>debug</span></label>
      <label class="pg-check">
        <input v-model="locale" type="radio" value="id" /><span>Bahasa Indonesia</span>
      </label>
      <label class="pg-check">
        <input v-model="locale" type="radio" value="en" /><span>English</span>
      </label>

      <p class="pg-section">Extensions</p>
      <label class="pg-check">
        <input v-model="customReferencesSidebar" type="checkbox" />
        <span>custom references sidebar</span>
      </label>
      <p class="pg-hint">
        Off → the library's <strong>built-in</strong> references sidebar. On → a host component injected
        through <code>#references-sidebar</code> (issue #22). Open it from the toolbar's References button.
      </p>

      <p class="pg-section">Collaboration</p>
      <label class="pg-field">
        <span class="pg-field__label">Connection state <code>connectionState</code></span>
        <select v-model="connectionState" class="pg-input pg-select">
          <option v-for="state in CONNECTION_OPTIONS" :key="state" :value="state">{{ state }}</option>
        </select>
      </label>

      <p class="pg-section">Host-owned data</p>
      <div class="pg-row">
        <span class="pg-field__label">Comments ({{ commentCount }})</span>
        <button class="pg-btn" type="button" @click="emit('add-comment-sample')">+ thread</button>
      </div>
      <div class="pg-row">
        <span class="pg-field__label">Versions ({{ snapshotCount }})</span>
        <button class="pg-btn" type="button" @click="emit('add-snapshot-sample')">+ version</button>
      </div>
      <p class="pg-hint">
        Comments and versions live in the host, not the library. Open the Comments / History sidebar from the toolbar to view them.
      </p>
    </div>
  </section>
</template>
