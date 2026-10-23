import { computed, ref, shallowRef } from 'vue'
import type { DocsEditor, DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import type { SavingStatus } from '../types.js'

/** One tab of the tabbed document surface. */
export interface TabItem {
  id: string
  label: string
  content: object
}

/**
 * The tabbed document shape persisted through `update:modelValue`. Header /
 * footer slots are view state stored alongside the tabs so a single host
 * payload round-trips the whole surface.
 */
export interface TabbedDoc {
  type: 'tabbed-doc'
  activeTabId: string
  tabs: TabItem[]
  headerLeft?: string
  headerRight?: string
  footerLeft?: string
  footerRight?: string
}

/** Header / footer slots, read lazily from the header-footer composable. */
export interface HeaderFooterValues {
  headerLeft: string
  headerRight: string
  footerLeft: string
  footerRight: string
}

export interface UseDocumentModelOptions {
  /** Initial host value, read once at setup. Later writes arrive via the sync composable. */
  modelValue: object | string | undefined
  /** Plugin list is read lazily so slash-command changes stay reactive. */
  getPlugins: () => DocsEditorPlugin[]
  emit: (event: 'update:modelValue', value: object) => void
  /**
   * Header / footer slots live on a composable created after this one; read
   * them lazily so persistence always snapshots the current values.
   */
  getHeaderFooter: () => HeaderFooterValues
  /** The editor is created after this composable; read it lazily for counts. */
  getEditor: () => DocsEditor['editor'] | null
}

/**
 * Tabbed-document model + persistence pipeline + derived counters. Owns the
 * `TabbedDoc` shape and the debounced `savingStatus`/`lastSaved` signal, but
 * never writes to storage — persistence is the host's job via
 * `update:modelValue` (LIBRARY_CONTRACT rule 5).
 */
export function useDocumentModel(options: UseDocumentModelOptions) {
  const { modelValue, getPlugins, emit, getHeaderFooter, getEditor } = options

  const isTabbedDoc = (val: unknown): val is TabbedDoc => {
    const obj = val as Record<string, unknown> | null
    return Boolean(obj && typeof obj === 'object' && obj.type === 'tabbed-doc' && Array.isArray(obj.tabs))
  }

  const parseModelValue = (val: unknown): TabbedDoc => {
    if (isTabbedDoc(val)) return val
    return {
      type: 'tabbed-doc',
      activeTabId: 'tab-1',
      tabs: [{ id: 'tab-1', label: 'Tab 1', content: val || { type: 'doc', content: [{ type: 'paragraph' }] } }],
    }
  }

  const initialDoc = parseModelValue(modelValue)

  const tabs = ref<Array<{ id: string; label: string; active: boolean }>>(
    initialDoc.tabs.map((t) => ({ id: t.id, label: t.label, active: t.id === initialDoc.activeTabId })),
  )
  const tabContents = ref<Record<string, object>>({})
  initialDoc.tabs.forEach(t => { tabContents.value[t.id] = t.content })
  const activeTabId = ref(initialDoc.activeTabId)
  const activeTabContent = computed(() => tabContents.value[activeTabId.value])

  /**
   * Last document handed to the host through `update:modelValue`. Echoes of it
   * (a `v-model` host writing the same value back, cloned or not) are ignored
   * by the host-write sync so they cannot reset the editor/selection.
   */
  const lastEmitted = shallowRef<object | null>(null)

  const wordCount = ref(0)
  const charCount = ref(0)
  const savingStatus = ref<SavingStatus>('saved')
  const lastSaved = ref(Date.now())
  const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  // Build the full tabbed document from current state and emit it to the host.
  // Persistence is the host's job (via update:modelValue / onUpdate) — the
  // library deliberately performs no storage writes (LIBRARY_CONTRACT rule 5).
  const persistCurrentDoc = () => {
    const { headerLeft, headerRight, footerLeft, footerRight } = getHeaderFooter()
    const fullDoc: TabbedDoc = {
      type: 'tabbed-doc',
      activeTabId: activeTabId.value,
      tabs: tabs.value.map(t => ({ id: t.id, label: t.label, content: tabContents.value[t.id] })),
      headerLeft,
      headerRight,
      footerLeft,
      footerRight,
    }
    lastEmitted.value = fullDoc
    emit('update:modelValue', fullDoc)
    savingStatus.value = 'saving'
    if (saveTimer.value) clearTimeout(saveTimer.value)
    saveTimer.value = setTimeout(() => { savingStatus.value = 'saved'; lastSaved.value = Date.now() }, 800)
  }

  /**
   * Replace the tab/document state with a host-written `modelValue` (issue
   * #370). Returns the content the editor should show and, for tabbed docs,
   * the header/footer slots the component should paint. A plain JSON document
   * collapses the surface back to a single tab.
   */
  const applyModelValue = (
    value: unknown,
  ): { content?: object; headerFooter?: HeaderFooterValues } => {
    const next = parseModelValue(value)
    const activeId = next.tabs.some(t => t.id === next.activeTabId)
      ? next.activeTabId
      : next.tabs[0]?.id ?? 'tab-1'

    tabs.value = next.tabs.map(t => ({ id: t.id, label: t.label, active: t.id === activeId }))
    const contents: Record<string, object> = {}
    next.tabs.forEach(t => { contents[t.id] = t.content })
    tabContents.value = contents
    activeTabId.value = activeId

    return {
      content: contents[activeId],
      headerFooter: isTabbedDoc(value)
        ? {
            headerLeft: next.headerLeft ?? '',
            headerRight: next.headerRight ?? '',
            footerLeft: next.footerLeft ?? '',
            footerRight: next.footerRight ?? '',
          }
        : undefined,
    }
  }

  const updateCounts = () => {
    const text = getEditor()?.getText() ?? ''
    charCount.value = text.length
    wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0
  }

  // Collect slash commands from all plugins
  const slashCommands = computed(() => {
    const cmds: Array<{ name: string; nameKey?: string; command: string }> = []
    for (const plugin of getPlugins()) {
      for (const sc of plugin.slashCommands || []) {
        cmds.push({ name: sc.name, nameKey: sc.nameKey, command: sc.command })
      }
    }
    return cmds
  })

  return {
    initialDoc,
    tabContents,
    activeTabId,
    activeTabContent,
    wordCount,
    charCount,
    savingStatus,
    lastSaved,
    saveTimer,
    persistCurrentDoc,
    applyModelValue,
    lastEmitted,
    updateCounts,
    slashCommands,
  }
}
