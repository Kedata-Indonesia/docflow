import { ref, type Ref } from 'vue'
import type { DocumentSnapshot } from '@kedata-indonesia/docflow-vue'
import { SAMPLE_SNAPSHOTS } from '../fixtures/collaboration'
import type { LogFn } from '../types'

export interface DocumentSnapshotsOptions {
  userName: Ref<string>
  log: LogFn
}

/** Host-owned version history: save a snapshot and create sample versions. */
export function useDocumentSnapshots({ userName, log }: DocumentSnapshotsOptions) {
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
        modifiedBy: userName.value,
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
