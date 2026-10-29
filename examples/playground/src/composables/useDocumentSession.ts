import { computed, ref, watch } from 'vue'
import {
  type Collaborator,
  type ConnectionState,
  type DocumentMode,
  type Locale,
} from '@kedata-indonesia/docflow-vue'
import { PRESETS, type PresetId } from '../fixtures/presets'
import { SAMPLE_COLLABORATORS } from '../fixtures/collaboration'
import { countNodes } from '../fixtures/pm'
import type { LogFn } from '../types'

export interface DocumentSessionOptions {
  log: LogFn
  /** Captured once at setup: `Date.now()` inside a computed would drift. */
  fixtureNow?: number
}

/**
 * The document session: the state a host app would own for one open document
 * (content, layout, locale, collaborators) plus the derived `documentMeta`.
 * The library never fetches any of this — it reacts to the props.
 */
export function useDocumentSession({
  log,
  fixtureNow = Date.now(),
}: DocumentSessionOptions) {
  const initialPreset = PRESETS.letter
  const presetId = ref<PresetId>('letter')
  const content = ref<object>(initialPreset.doc)
  const title = ref(initialPreset.title)

  const pageSize = ref('a4')
  const orientation = ref<'portrait' | 'landscape'>('portrait')
  const margins = ref({ top: 94, bottom: 94, left: 94, right: 94 })
  const headerMarginCm = ref(0.5)
  const footerMarginCm = ref(0.5)
  const pageless = ref(false)
  const virtualPages = ref(false)

  const editable = ref(true)
  const mode = ref<DocumentMode>('editing')
  const debug = ref(false)
  const locale = ref<Locale>('en')
  const userName = ref('Reviewer DocFlow')
  const connectionState = ref<ConnectionState>('connected')
  const collaborators = ref<Collaborator[]>(SAMPLE_COLLABORATORS)
  const pageCount = ref(1)

  const documentMeta = computed(() => ({
    id: 'playground-doc-1',
    title: title.value,
    owner: { userId: 'user-1', name: userName.value, email: 'reviewer@example.com' },
    createdAt: fixtureNow - 86_400_000,
    updatedAt: fixtureNow,
    wordCount: 0,
    charCount: 0,
    pageCount: pageCount.value,
    folderName: 'Playground',
  }))

  watch(presetId, (id) => {
    content.value = PRESETS[id].doc
    title.value = PRESETS[id].title
    log('preset', id)
  })

  function onContentUpdate(value: object): void {
    content.value = value
    log('update:modelValue', `${countNodes(value)} node`)
  }

  function onHeaderFooterMargins(value: {
    headerMarginCm: number
    footerMarginCm: number
  }): void {
    headerMarginCm.value = value.headerMarginCm
    footerMarginCm.value = value.footerMarginCm
    log('update:header-footer-margins', `${value.headerMarginCm} / ${value.footerMarginCm} cm`)
  }

  return {
    presetId,
    content,
    title,
    pageSize,
    orientation,
    margins,
    headerMarginCm,
    footerMarginCm,
    pageless,
    virtualPages,
    editable,
    mode,
    debug,
    locale,
    userName,
    connectionState,
    collaborators,
    pageCount,
    documentMeta,
    onContentUpdate,
    onHeaderFooterMargins,
  }
}
