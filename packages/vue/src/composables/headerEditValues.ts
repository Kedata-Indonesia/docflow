import type { Ref } from 'vue'

/** The two editable slots on the page. */
export type SlotSide = 'header' | 'footer'

/** Every slot ref the inline editor reads from and writes back to. */
export interface HeaderSlotRefs {
  isDifferentFirstPage: Ref<boolean>
  isDifferentOddEven: Ref<boolean>
  userHeaderLeft: Ref<string>
  userHeaderRight: Ref<string>
  userFirstPageHeaderLeft: Ref<string>
  userFirstPageHeaderRight: Ref<string>
  userEvenPageHeaderLeft: Ref<string>
  userFooterLeft: Ref<string>
  userFooterRight: Ref<string>
  userFirstPageFooterLeft: Ref<string>
  userFirstPageFooterRight: Ref<string>
  userEvenPageFooterLeft: Ref<string>
}

/** Callbacks the slot accessors need once a value changes. */
export interface SlotValueHooks {
  applyHeaderFooter: () => void
  persistCurrentDoc: () => void
}

/**
 * Map a page number onto the right slot flavour (first page / even page /
 * default). Header and footer differ only in which refs they touch; the
 * left slot is the value the inline editor edits, the right slot is its
 * page-number counterpart.
 */
export function createSlotValueAccessors(refs: HeaderSlotRefs, hooks: SlotValueHooks) {
  const getSlotValue = (side: SlotSide, pageNumber: number): string => {
    const isFirstPage = pageNumber === 1
    const isEvenPage = pageNumber % 2 === 0
    if (side === 'header') {
      if (refs.isDifferentFirstPage.value && isFirstPage) return refs.userFirstPageHeaderLeft.value
      if (refs.isDifferentOddEven.value && isEvenPage) return refs.userEvenPageHeaderLeft.value
      return refs.userHeaderLeft.value
    }
    if (refs.isDifferentFirstPage.value && isFirstPage) return refs.userFirstPageFooterLeft.value
    if (refs.isDifferentOddEven.value && isEvenPage) return refs.userEvenPageFooterLeft.value
    return refs.userFooterLeft.value
  }

  const assignSlotValue = (side: SlotSide, pageNumber: number, value: string): void => {
    const isFirstPage = pageNumber === 1
    const isEvenPage = pageNumber % 2 === 0
    if (side === 'header') {
      if (refs.isDifferentFirstPage.value && isFirstPage) refs.userFirstPageHeaderLeft.value = value
      else if (refs.isDifferentOddEven.value && isEvenPage) refs.userEvenPageHeaderLeft.value = value
      else refs.userHeaderLeft.value = value
      return
    }
    if (refs.isDifferentFirstPage.value && isFirstPage) refs.userFirstPageFooterLeft.value = value
    else if (refs.isDifferentOddEven.value && isEvenPage) refs.userEvenPageFooterLeft.value = value
    else refs.userFooterLeft.value = value
  }

  /** "Remove header/footer" clears both sides of the current slot flavour. */
  const clearSlotContent = (side: SlotSide): void => {
    if (side === 'header') {
      refs.userHeaderLeft.value = ''
      refs.userHeaderRight.value = ''
    } else {
      refs.userFooterLeft.value = ''
      refs.userFooterRight.value = ''
    }
    hooks.applyHeaderFooter()
    hooks.persistCurrentDoc()
  }

  return { getSlotValue, assignSlotValue, clearSlotContent }
}
