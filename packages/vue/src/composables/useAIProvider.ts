/**
 * Single source of truth for "which AI transports is this editor using right
 * now" (pluggable AI provider — issue #119, plan §8.1).
 *
 * Reads the host-injected `aiStream` / `aiDraft` ports from
 * `editor.storage.editorContext` — the same seam `AISidebar.vue` falls back
 * to. Component props still win over this fallback at the call site; this
 * composable answers the storage side only.
 *
 * Note: `editorContext` storage is not reactive by itself — the computed refs
 * re-evaluate when the editor instance changes. Hosts that hot-swap the
 * provider after boot (e.g. our SaaS settings page) re-inject via editor
 * options and should recreate or update the editor accordingly.
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { AIDraftFn, AIStreamFn } from '@kedata-indonesia/docflow-core'

export interface UseAIProviderReturn {
  aiStream: ComputedRef<AIStreamFn | undefined>
  aiDraft: ComputedRef<AIDraftFn | undefined>
  /** True when the host injected an `aiStream` transport. */
  isAIAvailable: ComputedRef<boolean>
}

export function useAIProvider(editor: Ref<Editor | null>): UseAIProviderReturn {
  const aiStream = computed<AIStreamFn | undefined>(
    () => (editor.value?.storage as any)?.editorContext?.aiStream,
  )
  const aiDraft = computed<AIDraftFn | undefined>(
    () => (editor.value?.storage as any)?.editorContext?.aiDraft,
  )
  const isAIAvailable = computed(() => Boolean(aiStream.value))
  return { aiStream, aiDraft, isAIAvailable }
}
