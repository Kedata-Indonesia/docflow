import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from '../components/ConfirmDialog.vue'

/**
 * Issue #359 — the in-app confirmation dialog that replaced `window.confirm`.
 *
 * The component teleports to <body>, so everything here is queried on the
 * document. Emits are asserted through listener spies rather than
 * `wrapper.emitted()`: the pinned @vue/test-utils does not record emits with
 * this Vue version, so `emitted()` would always be undefined.
 */

function mountDialog(
  props: Record<string, unknown> = {},
  listeners: { onConfirm?: () => void; onCancel?: () => void } = {},
) {
  return mount(ConfirmDialog, {
    props: {
      isOpen: true,
      title: 'Delete source?',
      message: 'Delete source "Book"? Citations referencing it will stop rendering.',
      ...props,
    },
    attrs: listeners,
    attachTo: document.body,
  })
}

function node(selector: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(selector)
}

function dialog(): HTMLElement {
  const el = node('[data-testid="confirm-dialog"]')
  expect(el).not.toBeNull()
  return el!
}

function pressKey(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

afterEach(() => {
  document.body.querySelectorAll('[data-testid="confirm-dialog-overlay"]').forEach((el) => el.remove())
})

describe('ConfirmDialog — rendering and ARIA (issue #359)', () => {
  it('renders nothing while closed', () => {
    const wrapper = mountDialog({ isOpen: false })
    expect(node('[data-testid="confirm-dialog"]')).toBeNull()
    wrapper.unmount()
  })

  it('renders an alertdialog wired to its title and message', () => {
    const wrapper = mountDialog()

    const el = dialog()
    expect(el.getAttribute('role')).toBe('alertdialog')
    expect(el.getAttribute('aria-modal')).toBe('true')

    // The ids must actually resolve — a dangling aria-labelledby is silent.
    const labelledBy = el.getAttribute('aria-labelledby')
    const describedBy = el.getAttribute('aria-describedby')
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy!)?.textContent).toContain('Delete source?')
    expect(document.getElementById(describedBy!)?.textContent).toContain('Citations referencing it')

    wrapper.unmount()
  })

  it('labels the buttons from the locale by default, and from props when given', () => {
    const wrapper = mountDialog()
    expect(node('[data-testid="confirm-dialog-cancel"]')?.textContent?.trim()).toBe('Cancel')
    expect(node('[data-testid="confirm-dialog-confirm"]')?.textContent?.trim()).toBe('Delete')
    wrapper.unmount()

    const custom = mountDialog({ confirmLabel: 'Remove', cancelLabel: 'Keep' })
    expect(node('[data-testid="confirm-dialog-cancel"]')?.textContent?.trim()).toBe('Keep')
    expect(node('[data-testid="confirm-dialog-confirm"]')?.textContent?.trim()).toBe('Remove')
    custom.unmount()
  })
})

describe('ConfirmDialog — answering (issue #359)', () => {
  it('confirms when the destructive button is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const wrapper = mountDialog({}, { onConfirm, onCancel })

    node('[data-testid="confirm-dialog-confirm"]')!.click()
    await nextTick()

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels when the cancel button is clicked', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const wrapper = mountDialog({}, { onConfirm, onCancel })

    node('[data-testid="confirm-dialog-cancel"]')!.click()
    await nextTick()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels on Escape', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const wrapper = mountDialog({}, { onConfirm, onCancel })

    pressKey('Escape')
    await nextTick()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('cancels on a backdrop click but not on a click inside the dialog', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const wrapper = mountDialog({}, { onConfirm, onCancel })

    dialog().click()
    await nextTick()
    expect(onCancel).not.toHaveBeenCalled()

    node('[data-testid="confirm-dialog-overlay"]')!.click()
    await nextTick()
    expect(onCancel).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('ignores Escape while closed', async () => {
    const onCancel = vi.fn()
    const wrapper = mountDialog({ isOpen: false }, { onCancel })

    pressKey('Escape')
    await nextTick()

    expect(onCancel).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('ConfirmDialog — focus management (issue #359)', () => {
  it('starts focus on Cancel, never on the destructive action', async () => {
    const wrapper = mountDialog()
    await nextTick()

    expect(document.activeElement).toBe(node('[data-testid="confirm-dialog-cancel"]'))
    wrapper.unmount()
  })

  it('traps Tab inside the dialog', async () => {
    const wrapper = mountDialog()
    await nextTick()

    const confirmButton = node('[data-testid="confirm-dialog-confirm"]')!
    const cancelButton = node('[data-testid="confirm-dialog-cancel"]')!

    // From the last focusable, Tab wraps to the first.
    confirmButton.focus()
    pressKey('Tab')
    await nextTick()
    expect(document.activeElement).toBe(cancelButton)

    // And Shift+Tab from the first wraps to the last.
    pressKey('Tab', { shiftKey: true })
    await nextTick()
    expect(document.activeElement).toBe(confirmButton)

    wrapper.unmount()
  })

  it('returns focus to the trigger when it closes', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Delete'
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mountDialog({ isOpen: false })
    await wrapper.setProps({ isOpen: true })
    await nextTick()
    expect(document.activeElement).toBe(node('[data-testid="confirm-dialog-cancel"]'))

    await wrapper.setProps({ isOpen: false })
    await nextTick()
    expect(document.activeElement).toBe(trigger)

    wrapper.unmount()
    trigger.remove()
  })
})
