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
        :title="open ? 'Sembunyikan panel' : 'Tampilkan panel'"
        @click="open = !open"
      >
        {{ open ? '▾' : '▸' }}
      </button>
      <span class="pg-card__title">Playground</span>
      <span class="pg-badge">public API</span>
    </header>

    <div v-if="open" class="pg-card__body">
      <p class="pg-section">Dokumen</p>
      <label class="pg-field">
        <span class="pg-field__label">Contoh dokumen</span>
        <select v-model="presetId" class="pg-input pg-select">
          <option value="surat">Surat undangan rapat</option>
          <option value="kontrak">Perjanjian kerja sama</option>
          <option value="laporan">Laporan bulanan</option>
        </select>
      </label>
      <label class="pg-field">
        <span class="pg-field__label">Judul <code>title</code></span>
        <input v-model="title" class="pg-input" type="text" />
      </label>
      <label class="pg-field">
        <span class="pg-field__label">Penulis <code>userName</code></span>
        <input v-model="userName" class="pg-input" type="text" />
      </label>

      <p class="pg-section">Tata letak</p>
      <label class="pg-field">
        <span class="pg-field__label">Ukuran halaman <code>pageSize</code></span>
        <select v-model="pageSize" class="pg-input pg-select">
          <option v-for="size in PAGE_SIZE_OPTIONS" :key="size.id" :value="size.id">{{ size.label }}</option>
        </select>
      </label>
      <label class="pg-field">
        <span class="pg-field__label">Orientasi <code>orientation</code></span>
        <select v-model="orientation" class="pg-input pg-select">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label class="pg-check"><input v-model="pageless" type="checkbox" /><span>pageless</span></label>
      <label class="pg-check"><input v-model="virtualPages" type="checkbox" /><span>virtualPages</span></label>

      <p class="pg-section">Perilaku</p>
      <label class="pg-check"><input v-model="editable" type="checkbox" /><span>editable</span></label>
      <label class="pg-check"><input v-model="debug" type="checkbox" /><span>debug</span></label>
      <label class="pg-check">
        <input v-model="locale" type="radio" value="id" /><span>Bahasa Indonesia</span>
      </label>
      <label class="pg-check">
        <input v-model="locale" type="radio" value="en" /><span>English</span>
      </label>

      <p class="pg-section">Kolaborasi</p>
      <label class="pg-field">
        <span class="pg-field__label">Status koneksi <code>connectionState</code></span>
        <select v-model="connectionState" class="pg-input pg-select">
          <option v-for="state in CONNECTION_OPTIONS" :key="state" :value="state">{{ state }}</option>
        </select>
      </label>

      <p class="pg-section">Data milik host</p>
      <div class="pg-row">
        <span class="pg-field__label">Komentar ({{ commentCount }})</span>
        <button class="pg-btn" type="button" @click="emit('add-comment-sample')">+ thread</button>
      </div>
      <div class="pg-row">
        <span class="pg-field__label">Versi ({{ snapshotCount }})</span>
        <button class="pg-btn" type="button" @click="emit('add-snapshot-sample')">+ versi</button>
      </div>
      <p class="pg-hint">
        Komentar dan versi hidup di host, bukan di library. Buka sidebar Komentar / Versi dari toolbar untuk melihatnya.
      </p>
    </div>
  </section>
</template>
