import { ref, type Ref } from 'vue'

/**
 * CSS pixels per centimetre at 96 dpi. The page-setup modal edits margins in
 * cm while the layout engine works in px, so the conversion lives here and is
 * shared with the header/footer margins (imported by `useHeaderFooter`).
 */
export const CM_TO_PX = 37.795

/** Largest body margin (px) the page-setup modal allows. */
const PAGE_MARGIN_MAX = 189

export interface PageMargins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface UsePageSetupOptions {
  pageSizeId: Ref<string>
  orientation: Ref<'portrait' | 'landscape'>
  margins: Ref<PageMargins>
  onUpdatePageSize: (pageSize: string) => void
  onUpdateOrientation: (orientation: 'portrait' | 'landscape') => void
  onUpdateMargins: (margins: PageMargins) => void
}

/**
 * Page Setup dialog state + apply logic. The composable never owns the live
 * layout refs (`pageSizeId` / `orientation` / `margins`); it reads them when
 * opening and writes them back (then notifies the host) on apply, so the
 * document layout stays the single source of truth in the component.
 */
export function usePageSetup(options: UsePageSetupOptions) {
  const {
    pageSizeId,
    orientation,
    margins,
    onUpdatePageSize,
    onUpdateOrientation,
    onUpdateMargins,
  } = options

  const showPageSetupModal = ref(false)
  const pageSetupSize = ref(pageSizeId.value)
  const pageSetupOrientation = ref<'portrait' | 'landscape'>(orientation.value)
  const pageSetupMarginsCm = ref<PageMargins>({
    top: toCm(margins.value.top),
    bottom: toCm(margins.value.bottom),
    left: toCm(margins.value.left),
    right: toCm(margins.value.right),
  })

  const PAGE_MARGIN_CM_MIN = 0
  const PAGE_MARGIN_CM_MAX = Number((PAGE_MARGIN_MAX / CM_TO_PX).toFixed(1))

  function toCm(px: number): number {
    return Math.round((px / CM_TO_PX) * 10) / 10
  }

  function toPx(cm: number): number {
    return Math.round(cm * CM_TO_PX)
  }

  const openPageSetupModal = () => {
    pageSetupSize.value = pageSizeId.value
    pageSetupOrientation.value = orientation.value
    pageSetupMarginsCm.value = {
      top: toCm(margins.value.top),
      bottom: toCm(margins.value.bottom),
      left: toCm(margins.value.left),
      right: toCm(margins.value.right),
    }
    showPageSetupModal.value = true
  }

  const applyPageSetup = () => {
    const clampCm = (value: unknown) => {
      const numericValue = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numericValue)) return PAGE_MARGIN_CM_MIN
      return Math.min(PAGE_MARGIN_CM_MAX, Math.max(PAGE_MARGIN_CM_MIN, numericValue))
    }

    pageSizeId.value = pageSetupSize.value
    orientation.value = pageSetupOrientation.value
    pageSetupMarginsCm.value = {
      top: clampCm(pageSetupMarginsCm.value.top),
      bottom: clampCm(pageSetupMarginsCm.value.bottom),
      left: clampCm(pageSetupMarginsCm.value.left),
      right: clampCm(pageSetupMarginsCm.value.right),
    }
    margins.value = {
      top: toPx(pageSetupMarginsCm.value.top),
      bottom: toPx(pageSetupMarginsCm.value.bottom),
      left: toPx(pageSetupMarginsCm.value.left),
      right: toPx(pageSetupMarginsCm.value.right),
    }
    onUpdatePageSize(pageSizeId.value)
    onUpdateOrientation(pageSetupOrientation.value)
    onUpdateMargins({ ...margins.value })
    showPageSetupModal.value = false
  }

  return {
    showPageSetupModal,
    pageSetupSize,
    pageSetupOrientation,
    pageSetupMarginsCm,
    PAGE_MARGIN_CM_MIN,
    PAGE_MARGIN_CM_MAX,
    openPageSetupModal,
    applyPageSetup,
  }
}
