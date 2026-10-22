<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useLocale } from '../composables/useLocale.js'

/**
 * Issue #359 — in-app confirmation for destructive actions that live inside
 * the library (deleting a reference source, deleting a comment thread).
 *
 * `window.confirm` was the previous behaviour and is wrong on four counts: it
 * cannot be styled, it blocks the thread, its button labels come from the
 * OS/browser locale rather than the app's, and a host cannot replace it with
 * its own dialog. Hosts that already own a dialog pass `confirmDestructive`
 * and never see this component.
 *
 * Accessibility contract:
 * - `role="alertdialog"` + `aria-modal` + `aria-labelledby`/`aria-describedby`.
 * - Focus enters on open and lands on **Cancel** — a stray Enter must never
 *   destroy anything.
 * - Tab / Shift+Tab cycle inside the dialog; Escape and a backdrop click cancel.
 * - Focus returns to the element that opened it.
 */

const props = defineProps<{
  isOpen: boolean
  /** Short question used as the dialog heading. */
  title: string
  /** The consequence of confirming — also the screen-reader description. */
  message: string
  /** Defaults to the localized "Delete". */
  confirmLabel?: string
  /** Defaults to the localized "Cancel". */
  cancelLabel?: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { t } = useLocale()

// Stable per-instance ids for aria-labelledby / aria-describedby.
const baseId = useId()
const titleId = `${baseId}-title`
const messageId = `${baseId}-message`

const dialog = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

const confirmText = computed(() => props.confirmLabel ?? t('common.delete'))
const cancelText = computed(() => props.cancelLabel ?? t('common.cancel'))

/** Element that had focus when the dialog opened, restored when it closes. */
let previouslyFocused: HTMLElement | null = null

function restoreFocus() {
  previouslyFocused?.focus?.()
  previouslyFocused = null
}

function cancel() {
  emit('cancel')
}

function confirm() {
  emit('confirm')
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function cycleTab(event: KeyboardEvent) {
  const root = dialog.value
  if (!root) return
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  // Wrap around at either end — and pull focus back in if it escaped.
  if (event.shiftKey) {
    if (active === first || !active || !root.contains(active)) {
      event.preventDefault()
      last.focus()
    }
  } else if (active === last || !active || !root.contains(active)) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * Capture phase on `document`: the editor binds Escape itself (dialogs, menus),
 * so the modal has to win before those handlers see the key.
 */
function onKeydown(event: KeyboardEvent) {
  if (!props.isOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
    return
  }
  if (event.key === 'Tab') cycleTab(event)
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      previouslyFocused =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
      void nextTick(() => cancelButton.value?.focus())
    } else {
      restoreFocus()
    }
  },
  { immediate: true },
)

onMounted(() => document.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  // The sidebar can unmount while the dialog is open.
  restoreFocus()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      data-testid="confirm-dialog-overlay"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      @click.self="cancel"
    >
      <div
        ref="dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="messageId"
        data-testid="confirm-dialog"
        class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl motion-safe:animate-confirm-in motion-reduce:animate-none dark:border-slate-800 dark:bg-[#0e1525] dark:text-slate-200"
      >
        <h2
          :id="titleId"
          data-testid="confirm-dialog-title"
          class="mb-2 text-base font-semibold"
        >
          {{ title }}
        </h2>
        <p
          :id="messageId"
          data-testid="confirm-dialog-message"
          class="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400"
        >
          {{ message }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            ref="cancelButton"
            type="button"
            data-testid="confirm-dialog-cancel"
            class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:hover:bg-white/5"
            @click="cancel"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            @click="confirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
