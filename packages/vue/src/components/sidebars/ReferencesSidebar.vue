<script setup lang="ts">
import { computed, ref } from 'vue'
import { BookOpen, X, Search, Plus } from 'lucide-vue-next'
import type { BibliographyFormat, CslItemData } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../composables/useLocale.js'
import type { ConfirmDestructiveFn } from '../../types.js'
import ConfirmDialog from '../ConfirmDialog.vue'
import ReferenceForm from './references/ReferenceForm.vue'
import ReferenceImportPanel from './references/ReferenceImportPanel.vue'
import ReferenceListItem from './references/ReferenceListItem.vue'
import ReferenceStylePicker from './references/ReferenceStylePicker.vue'
import { matchesQuery, type ReferenceStyleOption } from './references/format.js'

/**
 * Reference manager — a backend-agnostic UI shell (Phase 6B-3). It owns no
 * data and no editor access: sources + the active style come in as props,
 * every mutation goes out as an event. Hosts (apps/web with the REST API,
 * apps/demo in-memory) wire the events to their persistence.
 *
 * The dense panels live next door so this file stays the composition root:
 * `references/ReferenceStylePicker.vue` (style select/import/remove),
 * `references/ReferenceListItem.vue` (row), `references/ReferenceForm.vue`
 * (create/edit) and `references/ReferenceImportPanel.vue` (host-gated import).
 * Pure helpers and the shared option type live in `references/format.ts`.
 */

/** Kept exported from here so existing import sites stay valid. */
export type { ReferenceStyleOption } from './references/format.js'

const props = withDefaults(
  defineProps<{
    sources: CslItemData[]
    activeStyle: string
    /** Highlight the "Cite" action — used while an insert-citation request is pending. */
    pickerMode?: boolean
    availableStyles?: ReferenceStyleOption[]
    /** Show the import section (host implements the import ports, Phase 6C). */
    canImport?: boolean
    /** An import is in flight — disable the import actions. */
    importing?: boolean
    /** Host-provided import result message (success or error). */
    importMessage?: string
    /** Issue #251 — result message for a `.csl` style import (success or error). */
    styleImportMessage?: string
    /**
     * Issue #359 — host-supplied confirmation for deleting a source. When set
     * the host's own dialog decides and the built-in one is never rendered;
     * resolve `true` to proceed, `false`/reject to cancel.
     */
    confirmDestructive?: ConfirmDestructiveFn
  }>(),
  {
    pickerMode: false,
    availableStyles: () => [
      { id: 'chicago-notes-bibliography', name: 'Chicago (notes & bibliography)' },
      { id: 'chicago-author-date', name: 'Chicago (author-date)' },
      { id: 'apa', name: 'APA' },
      { id: 'modern-language-association', name: 'MLA' },
    ],
    canImport: false,
    importing: false,
    importMessage: '',
    styleImportMessage: '',
    confirmDestructive: undefined,
  },
)

const emit = defineEmits<{
  close: []
  insert: [sourceId: string]
  create: [source: CslItemData]
  update: [source: CslItemData]
  remove: [id: string]
  'update:style': [styleId: string]
  'remove-style': [styleId: string]
  'import-doi': [doi: string]
  'import-bibliography': [payload: { format: BibliographyFormat; text: string }]
  'import-style': [payload: { text: string; filename?: string }]
}>()

const { t } = useLocale()

// ─── List / search ──────────────────────────────────────────────────────────

const searchQuery = ref('')

const filteredSources = computed(() =>
  props.sources.filter((source) => matchesQuery(source, searchQuery.value)),
)

// ─── Form (create / edit) ───────────────────────────────────────────────────

const mode = ref<'list' | 'form'>('list')
/** `null` while creating; the form keys off the id so it remounts per source. */
const editingSource = ref<CslItemData | null>(null)

function openCreate() {
  editingSource.value = null
  mode.value = 'form'
}

function openEdit(source: CslItemData) {
  editingSource.value = source
  mode.value = 'form'
}

function closeForm() {
  mode.value = 'list'
}

function saveForm(source: CslItemData) {
  if (editingSource.value) {
    emit('update', source)
  } else {
    emit('create', source)
  }
  mode.value = 'list'
}

/**
 * Issue #359 — deleting a source is destructive and needs a confirmation
 * that the host can style and replace. Source waiting for the built-in
 * dialog's answer; `null` means the dialog is closed.
 */
const pendingRemoval = ref<CslItemData | null>(null)

function removeMessage(source: CslItemData): string {
  return t('sidebars.references.confirmDelete').replace('{title}', source.title ?? source.id)
}

async function handleRemove(source: CslItemData) {
  // A host that owns a dialog answers for us — the built-in one never renders.
  if (props.confirmDestructive) {
    let proceed = false
    try {
      proceed = await props.confirmDestructive(removeMessage(source))
    } catch {
      // A host dialog that fails must never delete anything.
      proceed = false
    }
    if (proceed) emit('remove', source.id)
    return
  }
  pendingRemoval.value = source
}

function onRemoveConfirmed() {
  const source = pendingRemoval.value
  pendingRemoval.value = null
  if (source) emit('remove', source.id)
}
</script>

<template>
  <div class="references-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all animate-fadeIn dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-slate-200 p-4 dark:border-white/5">
      <div>
        <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <BookOpen class="h-4 w-4 text-cyan-500" /> {{ t('sidebars.references.title') }}
        </h3>
        <p class="mt-1 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">{{ t('sidebars.references.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-white"
        :title="t('sidebars.references.close')"
        :aria-label="t('sidebars.references.close')"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- ═══ LIST MODE ═══ -->
    <template v-if="mode === 'list'">
      <!-- Citation style selector (select / import / remove) -->
      <ReferenceStylePicker
        :active-style="activeStyle"
        :available-styles="availableStyles"
        :style-import-message="styleImportMessage"
        @update:style="emit('update:style', $event)"
        @remove-style="emit('remove-style', $event)"
        @import-style="emit('import-style', $event)"
      />

      <!-- Search + add -->
      <div class="flex items-center gap-2 px-4 pb-2 pt-3">
        <div class="relative flex flex-1 items-center">
          <Search class="absolute left-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('sidebars.references.searchSources')"
            class="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-2 pl-9 pr-8 text-xs text-slate-700 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-500/50 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200 dark:focus:ring-cyan-400/30"
          >
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2.5 rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
            :aria-label="t('a11y.clearSearch')"
            @click="searchQuery = ''"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
        <button
          type="button"
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow transition-colors hover:bg-blue-700"
          :title="t('sidebars.references.addSource')"
          :aria-label="t('sidebars.references.addSource')"
          @click="openCreate"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>

      <!-- Source list -->
      <div class="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div v-if="sources.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
          <div class="mb-3 rounded-full bg-cyan-500/10 p-3 text-cyan-500 dark:bg-cyan-400/5">
            <BookOpen class="h-6 w-6" />
          </div>
          <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">{{ t('sidebars.references.noSources') }}</h4>
          <p class="mt-1.5 max-w-[220px] text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">{{ t('sidebars.references.noSourcesDescription') }}</p>
          <button
            type="button"
            class="mt-5 flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-semibold text-white shadow transition-colors hover:bg-blue-700"
            @click="openCreate"
          >
            <Plus class="h-3.5 w-3.5" /> {{ t('sidebars.references.addSource') }}
          </button>
        </div>

        <div v-else-if="filteredSources.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-slate-400">
          <Search class="mb-2 h-5 w-5 text-slate-300" />
          <p class="text-xs font-semibold">{{ t('sidebars.references.noMatchingSources') }}</p>
        </div>

        <!-- Issue #386 — survives removing a source row, so focus can land here. -->
        <div v-else data-confirm-fallback class="space-y-2 font-sans">
          <ReferenceListItem
            v-for="source in filteredSources"
            :key="source.id"
            :source="source"
            :picker-mode="pickerMode"
            @insert="emit('insert', $event)"
            @edit="openEdit"
            @remove="handleRemove"
          />
        </div>
      </div>

      <!-- Import (Phase 6C) — collapsible footer; only when the host
           implements the import ports -->
      <ReferenceImportPanel
        v-if="canImport"
        :importing="importing"
        :import-message="importMessage"
        @import-doi="emit('import-doi', $event)"
        @import-bibliography="emit('import-bibliography', $event)"
      />
    </template>

    <!-- ═══ FORM MODE ═══ -->
    <ReferenceForm
      v-else
      :key="editingSource?.id ?? 'new'"
      :source="editingSource"
      @save="saveForm"
      @cancel="closeForm"
    />

    <!-- Issue #359 — destructive confirmation, in-app instead of window.confirm. -->
    <ConfirmDialog
      :is-open="pendingRemoval !== null"
      :title="t('sidebars.references.confirmDeleteTitle')"
      :message="pendingRemoval ? removeMessage(pendingRemoval) : ''"
      @confirm="onRemoveConfirmed"
      @cancel="pendingRemoval = null"
    />
  </div>
</template>
