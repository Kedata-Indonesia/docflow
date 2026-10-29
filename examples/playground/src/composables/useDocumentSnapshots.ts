import { ref } from 'vue'
import type { DocumentSnapshot } from '@kedata-indonesia/docflow-vue'
import { SAMPLE_SNAPSHOTS } from '../sampleData'

type Options = {
  getUserName: () => string
  log: (name: string, detail?: string | number) => void
}

/** Version history owned by the host — the editor only shows the list. */
export function useDocumentSnapshots({ getUserName, log }: Options) {
  const snapshots = ref<DocumentSnapshot[]>(SAMPLE_SNAPSHOTS)

  function saveSnapshot(name: string): void {
    const nextIndex =
      snapshots.value.reduce((max, item) => Math.max(max, item.versionIndex), 0) + 1

    snapshots.value = [
      {
        versionId: `ver-${nextIndex}`,
        versionIndex: nextIndex,
        title: name,
        contentPreview: 'Snapshot created from the playground.',
        modifiedBy: getUserName(),
        timestamp: Date.now(),
      },
      ...snapshots.value,
    ]
    log('save-snapshot', name)
  }

  function addSampleSnapshot(): void {
    saveSnapshot(`Playground version ${snapshots.value.length + 1}`)
  }

  return { snapshots, saveSnapshot, addSampleSnapshot }
}
