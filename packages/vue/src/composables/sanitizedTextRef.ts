import { customRef, type Ref } from 'vue'
import { sanitizeInlineHTML } from '@kedata-indonesia/docflow-core'

/**
 * A `Ref<string>` whose every write is passed through `sanitizeInlineHTML`
 * (issue #51). Header/footer templates are document-derived and rendered with
 * `v-html` / `innerHTML`, so this is the single seam that guarantees no raw
 * document HTML ever reaches the render sinks.
 *
 * Exposed as `Ref<string>` so callers keep their existing shape. Writes that
 * sanitize to the stored value do not trigger reactivity.
 */
export function sanitizedTextRef(initialValue = ''): Ref<string> {
  let value = sanitizeInlineHTML(initialValue)

  return customRef<string>((track, trigger) => ({
    get(): string {
      track()
      return value
    },
    set(nextValue: string): void {
      const sanitized = sanitizeInlineHTML(nextValue)
      if (sanitized === value) return
      value = sanitized
      trigger()
    },
  }))
}
