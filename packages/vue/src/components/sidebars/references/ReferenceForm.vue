<script setup lang="ts">
import { computed, reactive } from 'vue'
import { ChevronLeft, Plus, X } from 'lucide-vue-next'
import type { CslItemData } from '@kedata-indonesia/docflow-core'
import { useLocale } from '../../../composables/useLocale.js'
import { FIELD_INPUT, FIELD_LABEL } from '../../../styles/classes.js'
import {
  SOURCE_TYPES,
  emptyForm,
  formFromSource,
  formToSource,
  typeLabel,
  visibleFields,
} from './format.js'

/**
 * Create / edit form for one CSL source. Mounted with a `:key` that changes per
 * source, so the initial model is built once per open (`null` = new source).
 */
const props = defineProps<{ source: CslItemData | null }>()

const emit = defineEmits<{
  save: [source: CslItemData]
  cancel: []
}>()

const { t } = useLocale()

const form = reactive(props.source ? formFromSource(props.source) : emptyForm())
const fields = computed(() => visibleFields(form.type))
const valid = computed(() => form.title.trim().length > 0)
const heading = computed(() =>
  props.source ? t('sidebars.references.editSource') : t('sidebars.references.addSource'),
)

function addAuthor() {
  form.authors.push({ family: '', given: '' })
}

function removeAuthor(index: number) {
  form.authors.splice(index, 1)
  if (form.authors.length === 0) form.authors.push({ family: '', given: '' })
}

function submit() {
  if (!valid.value) return
  emit('save', formToSource(form, props.source?.id ?? crypto.randomUUID()))
}
</script>

<template>
  <div class="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
    <button
      type="button"
      class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-white"
      :title="t('sidebars.references.back')"
      :aria-label="t('sidebars.references.back')"
      @click="emit('cancel')"
    >
      <ChevronLeft class="h-4 w-4" />
    </button>
    <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300">
      {{ heading }}
    </h4>
  </div>

  <div class="custom-scrollbar flex-1 overflow-y-auto p-4">
    <form class="space-y-3.5" @submit.prevent="submit">
      <!-- Type -->
      <div>
        <label :class="FIELD_LABEL">{{ t('sidebars.references.form.type') }}</label>
        <select v-model="form.type" :class="FIELD_INPUT">
          <option v-for="type in SOURCE_TYPES" :key="type" :value="type">{{ typeLabel(type, t) }}</option>
        </select>
      </div>

      <!-- Title -->
      <div>
        <label :class="FIELD_LABEL">{{ t('sidebars.references.form.title') }} *</label>
        <input v-model="form.title" type="text" required :class="FIELD_INPUT">
      </div>

      <!-- Authors -->
      <div>
        <label :class="FIELD_LABEL">{{ t('sidebars.references.form.authors') }}</label>
        <div class="space-y-2">
          <div v-for="(author, index) in form.authors" :key="index" class="flex items-center gap-1.5">
            <input
              v-model="author.family"
              type="text"
              :placeholder="t('sidebars.references.form.familyName')"
              class="w-1/2 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
            <input
              v-model="author.given"
              type="text"
              :placeholder="t('sidebars.references.form.givenName')"
              class="w-1/2 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200"
            >
            <button
              type="button"
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
              :aria-label="t('a11y.removeAuthor')"
              @click="removeAuthor(index)"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <button
          type="button"
          class="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          @click="addAuthor"
        >
          <Plus class="h-3 w-3" /> {{ t('sidebars.references.form.addAuthor') }}
        </button>
      </div>

      <!-- Year -->
      <div>
        <label :class="FIELD_LABEL">{{ t('sidebars.references.form.year') }}</label>
        <input v-model="form.year" type="number" min="0" :class="FIELD_INPUT">
      </div>

      <!-- Container (journal / book title for chapters) -->
      <div v-if="fields.container">
        <label :class="FIELD_LABEL">
          {{ form.type === 'chapter' ? t('sidebars.references.form.bookTitle') : t('sidebars.references.form.journal') }}
        </label>
        <input v-model="form.containerTitle" type="text" :class="FIELD_INPUT">
      </div>

      <!-- Publisher -->
      <div v-if="fields.publisher" class="grid grid-cols-2 gap-2">
        <div>
          <label :class="FIELD_LABEL">{{ t('sidebars.references.form.publisher') }}</label>
          <input v-model="form.publisher" type="text" :class="FIELD_INPUT">
        </div>
        <div>
          <label :class="FIELD_LABEL">{{ t('sidebars.references.form.publisherPlace') }}</label>
          <input v-model="form.publisherPlace" type="text" :class="FIELD_INPUT">
        </div>
      </div>

      <!-- Volume / issue / pages -->
      <div v-if="fields.locator" class="grid grid-cols-3 gap-2">
        <div>
          <label :class="FIELD_LABEL">{{ t('sidebars.references.form.volume') }}</label>
          <input v-model="form.volume" type="text" :class="FIELD_INPUT">
        </div>
        <div>
          <label :class="FIELD_LABEL">{{ t('sidebars.references.form.issue') }}</label>
          <input v-model="form.issue" type="text" :class="FIELD_INPUT">
        </div>
        <div>
          <label :class="FIELD_LABEL">{{ t('sidebars.references.form.pages') }}</label>
          <input v-model="form.page" type="text" :class="FIELD_INPUT">
        </div>
      </div>

      <!-- DOI -->
      <div v-if="fields.doi">
        <label :class="FIELD_LABEL">DOI</label>
        <input v-model="form.doi" type="text" placeholder="10.xxxx/xxxxx" :class="FIELD_INPUT">
      </div>

      <!-- URL -->
      <div v-if="fields.url">
        <label :class="FIELD_LABEL">URL</label>
        <input v-model="form.url" type="url" placeholder="https://…" :class="FIELD_INPUT">
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 pt-1.5">
        <button
          type="submit"
          :disabled="!valid"
          class="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {{ props.source ? t('sidebars.references.form.save') : t('sidebars.references.form.create') }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          @click="emit('cancel')"
        >
          {{ t('sidebars.references.form.cancel') }}
        </button>
      </div>
    </form>
  </div>
</template>
