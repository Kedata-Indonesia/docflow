import { computed, ref, toRaw, watch } from 'vue'
import type { DocsEditor, DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import type { SavingStatus } from '../types.js'

/** One tab of the tabbed document surface. */
export interface TabItem {
  id: string
  label: string
  content: object | string
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
  /** Read lazily so a host `modelValue` write after mount is observed. */
  getModelValue: () => object | string | undefined
  /** Plugin list is read lazily so slash-command changes stay reactive. */
  getPlugins: () => DocsEditorPlugin[]
  /** In collaboration mode the Yjs document is authoritative. */
  isCollaborative: () => boolean
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
function isTabbedDoc(val: unknown): val is TabbedDoc {
  const obj = val as Record<string, unknown> | null
  return Boolean(
    obj && typeof obj === 'object' && obj.type === 'tabbed-doc' && Array.isArray(obj.tabs),
  )
}

export function useDocumentModel(options: UseDocumentModelOptions) {
  const { getModelValue, getPlugins, isCollaborative, emit, getHeaderFooter, getEditor } = options

  const parseModelValue = (val: unknown): TabbedDoc => {
    if (isTabbedDoc(val)) return val
    return {
      type: 'tabbed-doc',
      activeTabId: 'tab-1',
      tabs: [{
        id: 'tab-1',
        label: 'Tab 1',
        content: val || { type: 'doc', content: [{ type: 'paragraph' }] },
      }],
    }
  }

  const initialDoc = parseModelValue(getModelValue())

  const tabs = ref<Array<{ id: string; label: string; active: boolean }>>(
    initialDoc.tabs.map((t) => ({ id: t.id, label: t.label, active: t.id === initialDoc.activeTabId })),
  )
  const tabContents = ref<Record<string, object | string>>({})
  initialDoc.tabs.forEach(t => { tabContents.value[t.id] = t.content })
  const activeTabId = ref(initialDoc.activeTabId)
  const activeTabContent = computed(() => tabContents.value[activeTabId.value])

  const wordCount = ref(0)
  const charCount = ref(0)
  const savingStatus = ref<SavingStatus>('saved')
  const lastSaved = ref(Date.now())
  const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  /**
   * The last document handed to the host. The `v-model` write that follows an
   * editor update carries this same object, so the guard below keeps it from
   * looping back into `setContent`.
   */
  let lastEmittedModelValue: TabbedDoc | null = null

  /** Compare unwrapped documents: `v-model` may hand back a reactive proxy. */
  const isSameDocument = (a: unknown, b: unknown): boolean => toRaw(a) === toRaw(b)

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
    lastEmittedModelValue = fullDoc
    emit('update:modelValue', fullDoc)
    savingStatus.value = 'saving'
    if (saveTimer.value) clearTimeout(saveTimer.value)
    saveTimer.value = setTimeout(() => { savingStatus.value = 'saved'; lastSaved.value = Date.now() }, 800)
  }

  /**
   * Apply a host write to the local model. The editor itself follows through
   * `useEditor`'s content watcher, which calls `setContent({ emitUpdate: false })`.
   */
  const applyHostModelValue = (value: object | string | undefined) => {
    if (value === undefined || isSameDocument(value, lastEmittedModelValue)) return

    if (isTabbedDoc(value)) {
      const [firstTab] = value.tabs
      if (!firstTab) return
      const nextActiveId = value.tabs.some(tab => tab.id === value.activeTabId)
        ? value.activeTabId
        : firstTab.id
      tabs.value = value.tabs.map(tab => ({
        id: tab.id,
        label: tab.label,
        active: tab.id === nextActiveId,
      }))
      tabContents.value = Object.fromEntries(value.tabs.map(tab => [tab.id, tab.content]))
      activeTabId.value = nextActiveId
      return
    }

    // A bare ProseMirror document replaces the currently active tab.
    tabContents.value[activeTabId.value] = value
  }

  // Host writes after mount (version-history restore/preview, document switch,
  // web-component `content` rewrite). Collaboration is authoritative, so a
  // local write is ignored there instead of racing the Yjs document.
  watch(getModelValue, (value) => {
    if (isCollaborative()) return
    applyHostModelValue(value)
  })

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
    updateCounts,
    slashCommands,
  }
}
