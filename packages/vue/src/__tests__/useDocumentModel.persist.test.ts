import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDocumentModel } from '../composables/useDocumentModel.js'

const createModel = (emit: (event: 'update:modelValue', value: object) => void) =>
  useDocumentModel({
    modelValue: { type: 'doc', content: [] },
    getPlugins: () => [],
    emit,
    getHeaderFooter: () => ({
      headerLeft: '',
      headerRight: '',
      footerLeft: '',
      footerRight: '',
    }),
    getEditor: () => null,
  })

describe('useDocumentModel persistence debounce (#374)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces a typing burst into one trailing emission', () => {
    const emit = vi.fn()
    const model = createModel(emit)

    model.schedulePersist()
    vi.advanceTimersByTime(200)
    model.schedulePersist()
    vi.advanceTimersByTime(200)
    expect(emit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('flushes a pending update immediately and cancels the timer', () => {
    const emit = vi.fn()
    const model = createModel(emit)

    model.schedulePersist()
    model.flushPersist()
    expect(emit).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(300)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('does not emit when no update is pending', () => {
    const emit = vi.fn()
    const model = createModel(emit)

    model.flushPersist()
    expect(emit).not.toHaveBeenCalled()
  })

  it('lets an explicit persist supersede the pending emission', () => {
    const emit = vi.fn()
    const model = createModel(emit)

    model.schedulePersist()
    model.persistCurrentDoc()
    expect(emit).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(300)
    expect(emit).toHaveBeenCalledTimes(1)
  })
})
