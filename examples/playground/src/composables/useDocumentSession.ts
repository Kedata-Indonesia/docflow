import { computed, ref, watch } from 'vue'
import { PRESETS, type PresetId } from '../sampleData'

type Options = {
  /** Read lazily so the document metadata follows the reviewer name input. */
  getUserName: () => string
  log: (name: string, detail?: string | number) => void
}

/**
 * Document identity owned by the host: the active preset, the `modelValue`
 * round-trip, the page count reported by the editor and the metadata panel.
 */
export function useDocumentSession({ getUserName, log }: Options) {
  const presetId = ref<PresetId>('letter')
  const content = ref<object>(PRESETS.letter.doc)
  const title = ref(PRESETS.letter.title)
  const pageCount = ref(1)

  /** Captured once: `Date.now()` inside the computed would drift on every recompute. */
  const fixtureNow = Date.now()

  const documentMeta = computed(() => ({
    id: 'playground-doc-1',
    title: title.value,
    owner: {
      userId: 'user-1',
      name: getUserName(),
      email: 'reviewer@example.com',
    },
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

  return { presetId, content, title, pageCount, documentMeta, onContentUpdate }
}

/**
 * `update:modelValue` carries a `TabbedDoc` (`{ type, activeTabId, tabs }`), so
 * the node count has to come from the tabs, not from a top-level `content`.
 */
function countNodes(value: object): number {
  const tabs = (value as { tabs?: Array<{ content?: { content?: unknown[] } }> }).tabs
  if (!tabs) return 0
  return tabs.reduce(
    (total, tab) => total + (tab.content?.content?.length ?? 0),
    0,
  )
}
