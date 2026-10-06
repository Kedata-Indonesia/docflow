import { computed, ref } from 'vue'
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

  const parseModelValue = (val: unknown): TabbedDoc => {
    const obj = val as Record<string, unknown> | null
    if (obj && typeof obj === 'object' && obj.type === 'tabbed-doc' && Array.isArray(obj.tabs)) {
      return obj as unknown as TabbedDoc
    }
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
    emit('update:modelValue', fullDoc)
    savingStatus.value = 'saving'
    if (saveTimer.value) clearTimeout(saveTimer.value)
    saveTimer.value = setTimeout(() => { savingStatus.value = 'saved'; lastSaved.value = Date.now() }, 800)
  }

  const updateCounts = () => {
    const text = getEditor()?.getText() ?? ''
    charCount.value = text.length
    wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0
  }

  // Collect slash commands from all plugins
  const slashCommands = computed(() => {
    const cmds: Array<{ name: string; command: string }> = []
    for (const plugin of getPlugins()) {
      for (const sc of plugin.slashCommands || []) {
        cmds.push({ name: sc.name, command: sc.command })
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
    updateCounts,
    slashCommands,
  }
}
