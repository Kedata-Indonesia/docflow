import { computed, type WritableComputedRef } from 'vue'

/**
 * Two-way draft binding for a child dialog field.
 *
 * The parent keeps ownership of the value: `source` reads it and `onChange`
 * reports edits upward. The returned computed is writable, so the field keeps
 * the exact `v-model` expression (including modifiers such as `.number`) it
 * used before the dialog markup was extracted into its own component.
 */
export function useDraftModel<T>(
  source: () => T,
  onChange: (value: T) => void,
): WritableComputedRef<T> {
  return computed({
    get: () => source(),
    set: (value) => onChange(value),
  })
}
