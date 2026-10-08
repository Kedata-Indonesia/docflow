import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { describe, it, expect, vi } from 'vitest'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import type { PageOverlayData } from '@kedata-indonesia/docflow-layout-engine'
import { useHeaderFooter } from '../composables/useHeaderFooter.js'
import { sanitizedTextRef } from '../composables/sanitizedTextRef.js'
import { paintHeaderFooter, type HeaderFooterPaintState } from '../composables/headerFooterPainter.js'
import VirtualPageOverlay from '../components/VirtualPageOverlay.vue'

const IMG_XSS = '<img src=x onerror="alert(document.cookie)">'
const SCRIPT_XSS = '<script>alert(1)</script>'
const SVG_XSS = '<svg onload="alert(1)"></svg>'
const JS_LINK = '<a href="javascript:alert(1)">J</a>'

describe('header/footer sanitization (issue #51)', () => {
  it('sanitizedTextRef sanitizes every write and keeps page tokens', () => {
    const slot = sanitizedTextRef('')
    slot.value = `${IMG_XSS}hi`
    expect(slot.value).toBe('hi')
    slot.value = 'Page {page} of {total}'
    expect(slot.value).toBe('Page {page} of {total}')
  })

  it('useHeaderFooter sanitizes slot refs on seed and on write (header + footer)', () => {
    let api!: ReturnType<typeof useHeaderFooter>
    const TestComponent = defineComponent({
      setup() {
        api = useHeaderFooter({
          editor: shallowRef<DocsEditor['editor'] | null>(null),
          isReady: ref(false),
          pageCount: ref(1),
          isDark: ref(false),
          initialContent: {
            headerLeft: `${IMG_XSS}H`,
            headerRight: `${SCRIPT_XSS}R`,
            footerLeft: `${SVG_XSS}F`,
            footerRight: JS_LINK,
          },
          headerMarginCmProp: ref<number | undefined>(undefined),
          footerMarginCmProp: ref<number | undefined>(undefined),
          pageNumber: {
            position: ref<'header' | 'footer'>('header'),
            showOnFirstPage: ref(true),
            mode: ref<'startAt' | 'continue'>('startAt'),
            startAt: ref(1),
          },
          persistCurrentDoc: () => {},
          onUpdatePageCount: () => {},
          onUpdateHeaderFooterMargins: () => {},
        })
        return () => h('div')
      },
    })
    const wrapper = mount(TestComponent)
    try {
      // Seeded from the (untrusted) document.
      expect(api.userHeaderLeft.value).toBe('H')
      expect(api.userHeaderRight.value).toBe('R')
      expect(api.userFooterLeft.value).toBe('F')
      expect(api.userFooterRight.value).toBe('J')

      // Later writes (modal save, page-number tokens, inline edit) too.
      api.userHeaderLeft.value = `${SCRIPT_XSS}mutated`
      api.userFooterRight.value = `${IMG_XSS}foot`
      expect(api.userHeaderLeft.value).toBe('mutated')
      expect(api.userFooterRight.value).toBe('foot')
    } finally {
      wrapper.unmount()
    }
  })

  it('VirtualPageOverlay renders sanitized header and footer markup', () => {
    const data: PageOverlayData = {
      totalPages: 3,
      visiblePages: [{ index: 0, top: 0, height: 100 }],
      config: {
        pageSize: { id: 'a4', name: 'A4', pageWidth: 794, pageHeight: 1123 },
        margins: { top: 20, bottom: 20, left: 50, right: 50 },
        pageGap: 40,
        headerLeft: `${IMG_XSS}H`,
        headerRight: `${SCRIPT_XSS}R`,
        footerLeft: 'F{page}/{total}',
        footerRight: `${SVG_XSS}Z`,
      },
    }

    const wrapper = mount(VirtualPageOverlay, { props: { data, isReady: true } })
    try {
      const html = wrapper.html()
      expect(html).not.toContain('onerror')
      expect(html).not.toContain('onload')
      expect(html).not.toContain('<script')
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<svg')
      expect(html).not.toContain('javascript:')
      expect(html).toContain('>H<')
      expect(html).toContain('>R<')
      expect(html).toContain('>F1/3<')
      expect(html).toContain('>Z<')
    } finally {
      wrapper.unmount()
    }
  })

  it('VirtualPageOverlay resolves {page}/{total} tokens in the header (issue #73 item 6)', () => {
    const data: PageOverlayData = {
      totalPages: 3,
      visiblePages: [{ index: 1, top: 0, height: 100 }],
      config: {
        pageSize: { id: 'a4', name: 'A4', pageWidth: 794, pageHeight: 1123 },
        margins: { top: 20, bottom: 20, left: 50, right: 50 },
        pageGap: 40,
        headerLeft: 'H{page}/{total}',
        headerRight: 'R{page}',
        footerLeft: '',
        footerRight: '',
      },
    }

    const wrapper = mount(VirtualPageOverlay, { props: { data, isReady: true } })
    try {
      const html = wrapper.html()
      expect(html).toContain('H2/3')
      expect(html).toContain('R2')
      expect(html).not.toContain('{page}')
      expect(html).not.toContain('{total}')
    } finally {
      wrapper.unmount()
    }
  })

  it('openFooterModal sanitizes the raw PaginationPlus appliedConfig fallback (#73)', () => {
    const mockEditor = {
      storage: {
        PaginationPlus: {
          appliedConfig: {
            footerLeft: `${IMG_XSS}Raw`,
            footerRight: `${SCRIPT_XSS}R`,
          },
        },
      },
    } as unknown as DocsEditor['editor']

    let api!: ReturnType<typeof useHeaderFooter>
    // eslint-disable-next-line vue/one-component-per-file -- test-only composable harness
    const TestComponent = defineComponent({
      setup() {
        api = useHeaderFooter({
          editor: shallowRef<DocsEditor['editor'] | null>(mockEditor),
          isReady: ref(false),
          pageCount: ref(1),
          isDark: ref(false),
          initialContent: { headerLeft: '', headerRight: '', footerLeft: '', footerRight: '' },
          headerMarginCmProp: ref<number | undefined>(undefined),
          footerMarginCmProp: ref<number | undefined>(undefined),
          pageNumber: {
            position: ref<'header' | 'footer'>('header'),
            showOnFirstPage: ref(true),
            mode: ref<'startAt' | 'continue'>('startAt'),
            startAt: ref(1),
          },
          persistCurrentDoc: () => {},
          onUpdatePageCount: () => {},
          onUpdateHeaderFooterMargins: () => {},
        })
        return () => h('div')
      },
    })
    const wrapper = mount(TestComponent)
    try {
      api.openFooterModal()
      expect(api.footerLeftInput.value).toBe('Raw')
      expect(api.footerRightInput.value).toBe('R')
      expect(api.showFooterModal.value).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })

  it('paintHeaderFooter hands sanitized content to commands and DOM (header + footer)', async () => {
    const dom = document.createElement('div')
    const header = document.createElement('div')
    header.className = 'rm-page-header'
    const hLeft = document.createElement('div')
    hLeft.className = 'rm-page-header-left'
    const hRight = document.createElement('div')
    hRight.className = 'rm-page-header-right'
    header.append(hLeft, hRight)
    const footer = document.createElement('div')
    footer.className = 'rm-page-footer'
    const fLeft = document.createElement('div')
    fLeft.className = 'rm-page-footer-left'
    const fRight = document.createElement('div')
    fRight.className = 'rm-page-footer-right'
    footer.append(fLeft, fRight)
    const breakEl = document.createElement('div')
    breakEl.className = 'rm-page-break'
    breakEl.append(header, footer)
    dom.append(breakEl)

    const updateHeaderContent = vi.fn()
    const updateFooterContent = vi.fn()
    const editor = {
      view: { dom, dispatch: vi.fn() },
      state: { tr: {} },
      commands: { updateHeaderContent, updateFooterContent },
    } as unknown as DocsEditor['editor']

    const state: HeaderFooterPaintState = {
      editor: shallowRef<DocsEditor['editor'] | null>(editor),
      isReady: ref(true),
      pageCount: ref(2),
      headerMarginCm: ref(1),
      footerMarginCm: ref(1),
      userHeaderLeft: ref(`${IMG_XSS}H{page}/{total}`),
      userHeaderRight: ref(`${SCRIPT_XSS}R`),
      userFooterLeft: ref(`${SVG_XSS}F{page}/{total}`),
      userFooterRight: ref(JS_LINK),
      isDifferentFirstPage: ref(false),
      isDifferentOddEven: ref(false),
      userFirstPageHeaderLeft: ref(''),
      userFirstPageHeaderRight: ref(''),
      userEvenPageHeaderLeft: ref(''),
      userEvenPageHeaderRight: ref(''),
      resolvePageNumber: (pageIndex) => String(pageIndex + 1),
    }

    paintHeaderFooter(state)

    // Commands (PaginationPlus innerHTML sink) receive allowlisted content.
    expect(updateHeaderContent).toHaveBeenCalledWith('H{page}/2', 'R')
    expect(updateFooterContent).toHaveBeenCalledWith('F{page}/2', 'J')

    // The deferred per-page pass writes the same sanitized content.
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(hLeft.innerHTML).toBe('H2/2')
    expect(hRight.innerHTML).toBe('R')
    expect(fLeft.innerHTML).toBe('F1/2')
    expect(fRight.innerHTML).toBe('J')
    expect(dom.innerHTML).not.toContain('onerror')
    expect(dom.innerHTML).not.toContain('<script')
    expect(dom.innerHTML).not.toContain('<img')
    expect(dom.innerHTML).not.toContain('<svg')
  })
})
