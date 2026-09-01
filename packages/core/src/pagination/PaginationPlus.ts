import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReplaceStep, ReplaceAroundStep, AddMarkStep, RemoveMarkStep, RemoveNodeMarkStep, AttrStep } from '@tiptap/pm/transform'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  footerClickEvent,
  getCustomPages,
  getFooter,
  getFooterHeight,
  getHeader,
  getHeaderHeight,
  getHeight,
  headerClickEvent,
  updateCssVariables,
  getPageSize,
  type PageSize,
} from './utils.js'

const page_count_meta_key = 'PAGE_COUNT_META_KEY'
const key = new PluginKey('brDecoration')

export interface PaginationPlusOptions {
  enabled?: boolean
  pageBreakBackground?: string
  pageHeight?: number
  pageWidth?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  pageGap?: number
  contentMarginTop?: number
  contentMarginBottom?: number
  footerRight?: string
  footerLeft?: string
  headerRight?: string
  headerLeft?: string
  customHeader?: Record<number, any>
  customFooter?: Record<number, any>
  pageGapBorderSize?: number
  pageGapBorderColor?: string
  onHeaderClick?: (info: { event: MouseEvent; pageNumber: number }) => void
  onFooterClick?: (info: { event: MouseEvent; pageNumber: number }) => void
}

function buildDecorations(doc: any) {
  const decorations: Decoration[] = []
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'hardBreak') {
      const afterPos = pos + 1
      const widget = Decoration.widget(afterPos, () => {
        const el = document.createElement('span')
        el.classList.add('rm-br-decoration')
        return el
      })
      decorations.push(widget)
    }
  })
  return DecorationSet.create(doc, decorations)
}

const defaultPageConfig: Required<Omit<PaginationPlusOptions, 'pageGapBorderSize' | 'pageGapBorderColor' | 'onHeaderClick' | 'onFooterClick'>> = {
  enabled: true,
  pageBreakBackground: '#f1f5f9',
  pageHeight: 800,
  pageWidth: 789,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 50,
  marginRight: 50,
  pageGap: 50,
  contentMarginTop: 10,
  contentMarginBottom: 10,
  footerRight: '{page}',
  footerLeft: '',
  headerRight: '',
  headerLeft: '',
  customHeader: {},
  customFooter: {},
}

const defaultOptions: PaginationPlusOptions = {
  pageGapBorderSize: 1,
  pageGapBorderColor: '#e5e5e5',
  ...defaultPageConfig,
}

const refreshPage = (targetNode: HTMLElement, paginationEnabled = true) => {
  const paginationElement = targetNode.querySelector('[data-rm-pagination]') as HTMLElement | null
  if (paginationEnabled) {
    targetNode.removeAttribute('rm-pagination-disabled')
    if (paginationElement) {
      const lastPageBreak = paginationElement.lastElementChild?.querySelector('.breaker') as HTMLElement | null
      if (lastPageBreak) {
        const minHeight = lastPageBreak.offsetTop + lastPageBreak.offsetHeight
        targetNode.style.minHeight = `calc(${minHeight}px + 2px)`
      }
    }
  } else {
    targetNode.setAttribute('rm-pagination-disabled', '')
    targetNode.style.minHeight = 'auto'
  }
}

const getPageConfig = (_storage: any, _currentOptions: any) => {
  const pageConfig = {
    enabled: _storage.enabled ?? defaultOptions.enabled,
    pageBreakBackground: _storage.pageBreakBackground ?? defaultOptions.pageBreakBackground,
    pageHeight: _storage.pageHeight ?? defaultOptions.pageHeight,
    pageWidth: _storage.pageWidth ?? defaultPageConfig.pageWidth,
    marginTop: _storage.marginTop ?? defaultPageConfig.marginTop,
    marginBottom: _storage.marginBottom ?? defaultPageConfig.marginBottom,
    marginLeft: _storage.marginLeft ?? defaultPageConfig.marginLeft,
    marginRight: _storage.marginRight ?? defaultPageConfig.marginRight,
    pageGap: _storage.pageGap ?? defaultPageConfig.pageGap,
    contentMarginTop: _storage.contentMarginTop ?? defaultPageConfig.contentMarginTop,
    contentMarginBottom: _storage.contentMarginBottom ?? defaultPageConfig.contentMarginBottom,
    footerRight: _storage.footerRight ?? defaultPageConfig.footerRight,
    footerLeft: _storage.footerLeft ?? defaultPageConfig.footerLeft,
    headerRight: _storage.headerRight ?? defaultPageConfig.headerRight,
    headerLeft: _storage.headerLeft ?? defaultPageConfig.headerLeft,
    customHeader: _storage.customHeader ?? defaultPageConfig.customHeader,
    customFooter: _storage.customFooter ?? defaultPageConfig.customFooter,
  }
  return {
    config: pageConfig,
    options: { ..._currentOptions, ...pageConfig },
  }
}

const getPageConfigFromOptions = (_currentOptions: any) => {
  return {
    enabled: _currentOptions.enabled ?? defaultOptions.enabled,
    pageBreakBackground: _currentOptions.pageBreakBackground ?? defaultOptions.pageBreakBackground,
    pageHeight: _currentOptions.pageHeight ?? defaultOptions.pageHeight,
    pageWidth: _currentOptions.pageWidth ?? defaultPageConfig.pageWidth,
    marginTop: _currentOptions.marginTop ?? defaultPageConfig.marginTop,
    marginBottom: _currentOptions.marginBottom ?? defaultPageConfig.marginBottom,
    marginLeft: _currentOptions.marginLeft ?? defaultPageConfig.marginLeft,
    marginRight: _currentOptions.marginRight ?? defaultPageConfig.marginRight,
    pageGap: _currentOptions.pageGap ?? defaultPageConfig.pageGap,
    contentMarginTop: _currentOptions.contentMarginTop ?? defaultPageConfig.contentMarginTop,
    contentMarginBottom: _currentOptions.contentMarginBottom ?? defaultPageConfig.contentMarginBottom,
    footerRight: _currentOptions.footerRight ?? defaultPageConfig.footerRight,
    footerLeft: _currentOptions.footerLeft ?? defaultPageConfig.footerLeft,
    headerRight: _currentOptions.headerRight ?? defaultPageConfig.headerRight,
    headerLeft: _currentOptions.headerLeft ?? defaultPageConfig.headerLeft,
    customHeader: _currentOptions.customHeader ?? defaultPageConfig.customHeader,
    customFooter: _currentOptions.customFooter ?? defaultPageConfig.customFooter,
  }
}

const paginationKey = new PluginKey('pagination')

const getExistingPageCount = (view: EditorView) => {
  const editorDom = view.dom as HTMLElement
  const paginationElement = editorDom.querySelector('[data-rm-pagination]')
  if (paginationElement) {
    return paginationElement.children.length
  }
  return 0
}

interface GapTrackerState {
  gap: number
  pages: number
  recent?: number[]
  flapping?: number[]
}

const pageGapTracker = new WeakMap<HTMLElement, GapTrackerState>()

const calculatePageCount = (view: EditorView, pageOptions: any, headerHeight = 0, footerHeight = 0) => {
  const editorDom = view.dom as HTMLElement
  const _pageHeaderHeight = pageOptions.contentMarginTop + pageOptions.marginTop + headerHeight
  const _pageFooterHeight = pageOptions.contentMarginBottom + pageOptions.marginBottom + footerHeight
  const pageContentAreaHeight = pageOptions.pageHeight - _pageHeaderHeight - _pageFooterHeight
  const paginationElement = editorDom.querySelector('[data-rm-pagination]')
  const currentPageCount = getExistingPageCount(view)

  if (paginationElement) {
    const lastElementOfEditor = editorDom.lastElementChild as HTMLElement | null
    const lastPageBreak = paginationElement.lastElementChild?.querySelector('.breaker') as HTMLElement | null

    if (lastElementOfEditor && lastPageBreak) {
      const lastElementRect = lastElementOfEditor.getBoundingClientRect()
      const lastPageBreakRect = lastPageBreak.getBoundingClientRect()
      const lastPageGap = lastElementRect.bottom - lastPageBreakRect.bottom

      if (lastPageGap > 0) {
        const addPage = Math.ceil(lastPageGap / pageContentAreaHeight)

        if (lastElementRect.height > pageContentAreaHeight) {
          const isSplittableTable =
            lastElementOfEditor.tagName === 'TABLE' && lastElementOfEditor.hasAttribute('data-tps-splittable')
          if (!isSplittableTable) {
            return currentPageCount
          }
        }

        let totalEditorContentHeight = 0
        for (const child of Array.from(editorDom.children)) {
          if (!(child instanceof HTMLElement)) continue
          if (child.hasAttribute('data-rm-pagination')) continue
          if (child.classList.contains('rm-page-break')) continue
          totalEditorContentHeight += child.getBoundingClientRect().height
        }

        const maxPagesByContent = Math.ceil(totalEditorContentHeight / pageContentAreaHeight)
        const contentCap = Math.max(currentPageCount, maxPagesByContent + 1)

        const prev = pageGapTracker.get(editorDom)
        if (prev && prev.pages < currentPageCount && lastPageGap > prev.gap - 2 && currentPageCount >= maxPagesByContent) {
          return currentPageCount
        }

        const recent = prev?.recent ?? []
        let flapping = prev?.flapping ?? []
        if (recent.length >= 4 && recent.filter((p) => p === currentPageCount + addPage).length >= 2 && currentPageCount >= maxPagesByContent) {
          flapping = [...new Set([...flapping, currentPageCount + addPage, currentPageCount])]
          pageGapTracker.set(editorDom, { gap: lastPageGap, pages: currentPageCount, recent, flapping })
          return currentPageCount
        }

        pageGapTracker.set(editorDom, { gap: lastPageGap, pages: currentPageCount, recent, flapping })

        if (currentPageCount + addPage > contentCap) {
          return contentCap
        }

        const MAX_PAGES = 1000
        if (currentPageCount + addPage > MAX_PAGES) {
          return currentPageCount
        }
        return currentPageCount + addPage
      } else {
        const allBreaksAfterLastElement = Array.from(paginationElement.querySelectorAll<HTMLElement>('.breaker'))
        const allBreaksAfterLastElementRect = allBreaksAfterLastElement.filter(
          (element) => element.getBoundingClientRect().top > lastElementRect.bottom
        )
        const removePage = allBreaksAfterLastElementRect.length
        if (removePage > 1) {
          return currentPageCount - (removePage - 1)
        } else {
          return currentPageCount
        }
      }
    }
    return 1
  } else {
    const editorHeight = editorDom.scrollHeight
    let pageCount = Math.ceil(editorHeight / pageContentAreaHeight)
    pageCount = pageCount <= 0 ? 1 : pageCount
    return pageCount
  }
}

const getNewPageCount = (view: EditorView, pageOptions: any) => {
  if (pageOptions.enabled) {
    const pageCount = calculatePageCount(view, pageOptions)
    return pageCount <= 1 ? 1 : pageCount
  } else return 0
}

function createDecoration(pageOptions: any, headerHeightMap: Map<number, number>, footerHeightMap: Map<number, number>) {
  if (!pageOptions.enabled) return []
  const commonHeaderOptions = {
    headerLeft: pageOptions.headerLeft,
    headerRight: pageOptions.headerRight,
  }
  const commonFooterOptions = {
    footerLeft: pageOptions.footerLeft,
    footerRight: pageOptions.footerRight,
  }

  return [
    Decoration.widget(
      0,
      (view: EditorView) => {
        const _pageGap = pageOptions.pageGap
        const _pageBreakBackground = pageOptions.pageBreakBackground
        const el = document.createElement('div')
        el.dataset.rmPagination = 'true'

        const pageBreakDefinition = (
          firstPage: boolean,
          pageHeader: HTMLElement,
          pageFooter: HTMLElement,
          headerHeight: number,
          footerHeight: number,
          pageNumber?: number
        ) => {
          const { _pageHeaderHeight, _pageHeight } = getHeight(pageOptions, headerHeight, footerHeight)
          const pageContainer = document.createElement('div')
          pageContainer.classList.add('rm-page-break')

          const page = document.createElement('div')
          page.classList.add('page')
          page.style.position = 'relative'
          page.style.float = 'left'
          page.style.clear = 'both'

          const marginTop = firstPage ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)` : _pageHeight + 'px'
          if (pageNumber) {
            page.style.marginTop = `var(--rm-page-content-${pageNumber}, ${marginTop})`
          } else {
            page.style.marginTop = firstPage
              ? `var(--rm-page-content-first, ${marginTop})`
              : `var(--rm-page-content-general, ${marginTop})`
          }

          const pageBreak = document.createElement('div')
          pageBreak.classList.add('breaker')
          pageBreak.style.width = `calc(100% + var(--rm-margin-left) + var(--rm-margin-right))`
          pageBreak.style.marginLeft = `calc(-1 * var(--rm-margin-left))`
          pageBreak.style.marginRight = `calc(-1 * var(--rm-margin-right))`
          pageBreak.style.position = 'relative'
          pageBreak.style.float = 'left'
          pageBreak.style.clear = 'both'
          pageBreak.style.left = '0px'
          pageBreak.style.right = '0px'
          pageBreak.style.zIndex = '2'

          const pageSpace = document.createElement('div')
          pageSpace.classList.add('rm-pagination-gap')
          pageSpace.style.height = _pageGap + 'px'
          pageSpace.style.borderLeft = '1px solid'
          pageSpace.style.borderRight = '1px solid'
          pageSpace.style.position = 'relative'
          pageSpace.style.setProperty('width', 'calc(100% + 2px)', 'important')
          pageSpace.style.left = '-1px'
          pageSpace.style.backgroundColor = _pageBreakBackground
          pageSpace.style.borderLeftColor = _pageBreakBackground
          pageSpace.style.borderRightColor = _pageBreakBackground

          pageBreak.append(pageFooter, pageSpace, pageHeader)
          pageContainer.append(page, pageBreak)
          return pageContainer
        }

        const _headerHeight = headerHeightMap.get(0) || 0
        const _footerHeight = footerHeightMap.get(0) || 0
        const fragment = document.createDocumentFragment()
        const pageCount = getNewPageCount(view, pageOptions)

        for (let i = 0; i < pageCount; i++) {
          const pageNumber = i + 1
          const headerPageNumber = i + 2
          if (
            headerPageNumber in pageOptions.customHeader ||
            pageNumber in pageOptions.customFooter ||
            pageNumber in pageOptions.customHeader
          ) {
            let _headerOptions = commonHeaderOptions
            let _footerOptions = commonFooterOptions
            let _pageHeaderHeight = _headerHeight
            let _pageFooterHeight = _footerHeight

            if (headerPageNumber in pageOptions.customHeader) {
              _headerOptions = pageOptions.customHeader[headerPageNumber] || commonHeaderOptions
              _pageHeaderHeight = headerHeightMap.get(headerPageNumber) || 0
            }
            if (pageNumber in pageOptions.customFooter) {
              _footerOptions = pageOptions.customFooter[pageNumber] || commonFooterOptions
              _pageFooterHeight = footerHeightMap.get(pageNumber) || 0
            }

            const _pageHeader = getHeader(
              _headerOptions.headerRight,
              _headerOptions.headerLeft,
              headerClickEvent(headerPageNumber, pageOptions.onHeaderClick),
              headerPageNumber
            )
            const _pageFooter = getFooter(
              _footerOptions.footerRight,
              _footerOptions.footerLeft,
              footerClickEvent(pageNumber, pageOptions.onFooterClick),
              pageNumber
            )
            const pageBreak = pageBreakDefinition(
              i === 0,
              _pageHeader,
              _pageFooter,
              _pageHeaderHeight,
              _pageFooterHeight,
              pageNumber
            )
            fragment.appendChild(pageBreak)
          } else {
            const __pageHeader = getHeader(
              commonHeaderOptions.headerRight,
              commonHeaderOptions.headerLeft,
              headerClickEvent(headerPageNumber, pageOptions.onHeaderClick)
            )
            const __pageFooter = getFooter(
              commonFooterOptions.footerRight,
              commonFooterOptions.footerLeft,
              footerClickEvent(pageNumber, pageOptions.onFooterClick)
            )
            fragment.appendChild(pageBreakDefinition(i === 0, __pageHeader, __pageFooter, _headerHeight, _footerHeight))
          }
        }
        el.append(fragment)
        el.id = 'pages'
        el.classList.add('rm-pages-wrapper')
        return el
      },
      { side: -1 }
    ),
    Decoration.widget(
      0,
      () => {
        const pageNumber = 1
        let _headerOptions = commonHeaderOptions
        if (pageNumber in pageOptions.customHeader) {
          _headerOptions = pageOptions.customHeader[pageNumber]
        }
        const el = getHeader(
          _headerOptions.headerRight,
          _headerOptions.headerLeft,
          headerClickEvent(pageNumber, pageOptions.onHeaderClick)
        )
        el.classList.add('rm-first-page-header')
        return el
      },
      { side: -1 }
    ),
  ]
}

export const PAGE_SIZES: Record<string, PageSize> = {
  A4: getPageSize(1123, 794, 95, 95, 76, 76),
  A3: getPageSize(1591, 1123, 95, 95, 76, 76),
  A5: getPageSize(794, 419, 76, 76, 57, 57),
  LETTER: getPageSize(1060, 818, 96, 96, 96, 96),
  LEGAL: getPageSize(1404, 818, 96, 96, 96, 96),
  TABLOID: getPageSize(1635, 1060, 96, 96, 96, 96),
}

export const PaginationPlus = Extension.create<PaginationPlusOptions>({
  name: 'PaginationPlus',
  addOptions() {
    return defaultOptions
  },
  addStorage() {
    return {
      ...defaultOptions,
      headerHeight: new Map<number, number>(),
      footerHeight: new Map<number, number>(),
      appliedConfig: defaultPageConfig,
    }
  },
  onCreate() {
    const { options: _currentOptions } = getPageConfig(this.storage, this.options)
    const pageConfig = getPageConfigFromOptions(this.options)
    const targetNode = this.editor.view.dom as HTMLElement
    targetNode.classList.add('rm-with-pagination')
    targetNode.style.border = `1px solid var(--rm-page-gap-border-color)`
    targetNode.style.paddingLeft = 'var(--rm-margin-left)'
    targetNode.style.paddingRight = 'var(--rm-margin-right)'
    targetNode.style.width = 'var(--rm-page-width)'
    updateCssVariables(targetNode, { ..._currentOptions, ...pageConfig })

    if (!document.querySelector('style[data-rm-pagination-style]')) {
      const style = document.createElement('style')
      style.dataset.rmPaginationStyle = ''
      style.textContent = `
        .rm-pagination-gap{
          border-top: 1px solid;
          border-bottom: 1px solid;
          border-color: var(--rm-page-gap-border-color);
        }
        .rm-with-pagination,
        .rm-with-pagination .rm-first-page-header {
          counter-reset: page-number page-number-plus 1;
        }
        .rm-with-pagination .image-plus-wrapper,
        .rm-with-pagination .table-plus td,
        .rm-with-pagination .table-plus th {
          max-height: var(--rm-max-content-child-height);
          overflow-y: auto;
        }
        .rm-with-pagination .image-plus-wrapper {
          overflow-y: visible;
        }
        .rm-with-pagination .rm-page-break {
          counter-increment: page-number page-number-plus;
        }
        .rm-with-pagination .rm-page-break:last-child .rm-pagination-gap {
          display: none;
        }
        .rm-with-pagination .rm-page-break:last-child .rm-page-header {
          display: none;
        }
        .rm-with-pagination table tr td,
        .rm-with-pagination table tr th {
          word-break: break-all;
        }
        .rm-with-pagination table > tr {
          display: grid;
          min-width: 100%;
        }
        .rm-with-pagination table {
          border-collapse: collapse;
          width: 100%;
          display: contents;
        }
        .rm-with-pagination table tbody > tr{
          display: table-row !important;
        }
        .rm-with-pagination *:has(>br.ProseMirror-trailingBreak:only-child) {
          display: table;
          width: 100%;
        }
        .rm-with-pagination .rm-br-decoration {
          display: table;
          width: 100%;
        }
        .rm-with-pagination .table-row-group {
          max-height: var(--rm-max-content-child-height);
          overflow-y: auto;
          width: 100%;
        }
        .rm-with-pagination .rm-page-footer-left,
        .rm-with-pagination .rm-page-footer-right,
        .rm-with-pagination .rm-page-header-left,
        .rm-with-pagination .rm-page-header-right {
          display: inline-block;
        }
        .rm-with-pagination .rm-page-header-left,
        .rm-with-pagination .rm-page-footer-left{
          float: left;
          margin-left: var(--rm-margin-left);
        }
        .rm-with-pagination .rm-page-header-right,
        .rm-with-pagination .rm-page-footer-right{
          float: right;
          margin-right: var(--rm-margin-right);
        }
        .rm-with-pagination .rm-first-page-header .rm-page-header-right{
          margin-right: 0px !important;
        }
        .rm-with-pagination .rm-first-page-header .rm-page-header-left{
          margin-left: 0px !important;
        }
        .rm-with-pagination .rm-page-number::before {
          content: counter(page-number);
        }
        .rm-with-pagination .rm-page-number-plus::before {
          content: counter(page-number-plus);
        }
        .rm-with-pagination .rm-page-header,
        .rm-with-pagination .rm-page-footer{
          width: 100%;
        }
        .rm-with-pagination .rm-page-header{
          padding-bottom: var(--rm-content-margin-top) !important;
          padding-top: var(--rm-margin-top) !important;
          display: inline-flex;
          justify-content: space-between;
          max-height: calc(calc(var(--rm-page-height) * 0.45) - var(--rm-margin-top) - var(--rm-content-margin-top));
          overflow-y: hidden;
        }
        .rm-with-pagination .rm-page-footer{
          padding-top: var(--rm-content-margin-bottom) !important;
          padding-bottom: var(--rm-margin-bottom) !important;
          display: inline-flex;
          justify-content: space-between;
          max-height: calc(calc(var(--rm-page-height) * 0.45) - var(--rm-content-margin-bottom) - var(--rm-margin-bottom));
          overflow-y: hidden;
        }
        .rm-with-pagination[rm-pagination-disabled] {
          padding-top: var(--rm-margin-top) !important;
          padding-bottom: var(--rm-margin-bottom) !important;
        }
      `
      document.head.appendChild(style)
    }
    refreshPage(targetNode, _currentOptions.enabled)
  },
  addProseMirrorPlugins() {
    const storage = this.storage as any
    const options = this.options
    return [
      new Plugin({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old) => {
            const { options: _currentOptions, config: pageConfig } = getPageConfig(storage, options)
            if (!pageConfig.enabled) {
              return DecorationSet.empty
            }
            const footerHeight = storage.footerHeight as Map<number, number>
            const headerHeight = storage.headerHeight as Map<number, number>
            const isPageCountChanged = tr.getMeta(page_count_meta_key)
            if (isPageCountChanged || tr.docChanged) {
              return DecorationSet.create(
                tr.doc,
                createDecoration(
                  { ..._currentOptions, ...pageConfig },
                  headerHeight ?? new Map(),
                  footerHeight ?? new Map()
                )
              )
            }
            return old
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state) ?? DecorationSet.empty
          },
        },
        view: () => {
          return {
            update: (view) => {
              const { options: _currentOptions, config: pageConfig } = getPageConfig(storage, options)
              if (!pageConfig.enabled && !(view.dom as HTMLElement).hasAttribute('rm-pagination-disabled')) {
                refreshPage(view.dom as HTMLElement, false)
                return
              }
              const pageCount = getNewPageCount(view, { ..._currentOptions, ...pageConfig })
              const currentPageCount = getExistingPageCount(view)
              const triggerUpdate = (_footerHeight?: any) => {
                requestAnimationFrame(() => {
                  const history = pageGapTracker.get(view.dom as HTMLElement)
                  if (history && history.flapping && history.flapping.includes(pageCount)) {
                    return
                  }
                  if (history && history.recent) {
                    history.recent.push(pageCount)
                  }
                  const tr = view.state.tr.setMeta(page_count_meta_key, { footerHeight: _footerHeight })
                  view.dispatch(tr)
                })
              }
              if (currentPageCount !== pageCount) {
                triggerUpdate()
                return
              }
              const headerHeight = getHeaderHeight(view.dom as HTMLElement, getCustomPages(_currentOptions.customHeader, {}), 'content')
              const footerHeight = getFooterHeight(view.dom as HTMLElement, getCustomPages({}, _currentOptions.customFooter), 'content')
              const footerHeightForCurrentPages = new Map<number, number>()
              for (let i = 0; i <= pageCount; i++) {
                if (footerHeight.has(i)) {
                  footerHeightForCurrentPages.set(i, footerHeight.get(i) || 0)
                }
              }
              const headerHeightForCurrentPages = new Map<number, number>()
              for (let i = 0; i <= pageCount; i++) {
                if (headerHeight.has(i)) {
                  headerHeightForCurrentPages.set(i, headerHeight.get(i) || 0)
                }
              }
              const pagesSetToCheck = new Set([1, ...footerHeightForCurrentPages.keys(), ...headerHeightForCurrentPages.keys()])
              let missingPageNumber: number | undefined
              for (let i = 1; i <= pageCount; i++) {
                if (!pagesSetToCheck.has(i)) {
                  missingPageNumber = i
                  break
                }
              }
              if (missingPageNumber) {
                pagesSetToCheck.add(missingPageNumber)
              }
              pagesSetToCheck.delete(0)
              const pageContentHeightVariable: Record<string, string> = {}
              let maxContentHeight: number | undefined
              for (const page of pagesSetToCheck) {
                const hHeight = headerHeightForCurrentPages.has(page) ? headerHeightForCurrentPages.get(page) || 0 : headerHeightForCurrentPages.get(0) || 0
                const fHeight = footerHeightForCurrentPages.has(page) ? footerHeightForCurrentPages.get(page) || 0 : footerHeightForCurrentPages.get(0) || 0
                const { _pageHeaderHeight, _pageHeight } = getHeight(_currentOptions, hHeight, fHeight)
                const contentHeight = page === 1 ? _pageHeight + _pageHeaderHeight : _pageHeight
                if (page === 1) {
                  pageContentHeightVariable['rm-page-content-first'] = `${contentHeight}px`
                }
                if (page === missingPageNumber) {
                  pageContentHeightVariable['rm-page-content-general'] = `${contentHeight}px`
                } else {
                  pageContentHeightVariable[`rm-page-content-${page}`] = `${contentHeight}px`
                }
                if (maxContentHeight === undefined || contentHeight < maxContentHeight) {
                  maxContentHeight = contentHeight
                }
              }
              if (maxContentHeight) {
                ;(view.dom as HTMLElement).style.setProperty('--rm-max-content-child-height', `${maxContentHeight - 10}px`)
              }
              Object.entries(pageContentHeightVariable).forEach(([k, value]) => {
                ;(view.dom as HTMLElement).style.setProperty(`--${k}`, value)
              })
              refreshPage(view.dom as HTMLElement, _currentOptions.enabled)
            },
          }
        },
      }),
      new Plugin({
        key,
        state: {
          init(_, state) {
            return buildDecorations(state.doc)
          },
          apply(tr, old) {
            if (
              tr.docChanged ||
              tr.steps.some(
                (step) =>
                  step instanceof ReplaceStep ||
                  step instanceof ReplaceAroundStep ||
                  step instanceof AddMarkStep ||
                  step instanceof RemoveMarkStep ||
                  step instanceof RemoveNodeMarkStep ||
                  step instanceof AttrStep
              )
            ) {
              return buildDecorations(tr.doc)
            }
            return old
          },
        },
        props: {
          decorations(state) {
            return key.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
  addCommands() {
    return {
      updatePageBreakBackground: (color: string) => () => {
        this.storage.pageBreakBackground = color
        return true
      },
      updatePageSize: (size: PageSize) => () => {
        this.storage.pageHeight = size.pageHeight
        this.storage.pageWidth = size.pageWidth
        this.storage.marginTop = size.marginTop
        this.storage.marginBottom = size.marginBottom
        this.storage.marginLeft = size.marginLeft
        this.storage.marginRight = size.marginRight
        return true
      },
      updatePageWidth: (width: number) => () => {
        this.storage.pageWidth = width
        return true
      },
      updatePageHeight: (height: number) => () => {
        this.storage.pageHeight = height
        return true
      },
      updatePageGap: (gap: number) => () => {
        this.storage.pageGap = gap
        return true
      },
      updateMargins: (margins: { top: number; bottom: number; left: number; right: number }) => () => {
        this.storage.marginTop = margins.top
        this.storage.marginBottom = margins.bottom
        this.storage.marginLeft = margins.left
        this.storage.marginRight = margins.right
        return true
      },
      updateHeaderContent: (left?: string, right?: string) => () => {
        if (left !== undefined) this.storage.headerLeft = left
        if (right !== undefined) this.storage.headerRight = right
        return true
      },
      updateFooterContent: (left?: string, right?: string) => () => {
        if (left !== undefined) this.storage.footerLeft = left
        if (right !== undefined) this.storage.footerRight = right
        return true
      },
      enablePagination: () => () => {
        this.storage.enabled = true
        return true
      },
      disablePagination: () => () => {
        this.storage.enabled = false
        return true
      },
    } as any
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paginationPlus: {
      updatePageBreakBackground: (color: string) => ReturnType
      updatePageSize: (size: PageSize) => ReturnType
      updatePageWidth: (width: number) => ReturnType
      updatePageHeight: (height: number) => ReturnType
      updatePageGap: (gap: number) => ReturnType
      updateMargins: (margins: { top: number; bottom: number; left: number; right: number }) => ReturnType
      enablePagination: () => ReturnType
      disablePagination: () => ReturnType
      updateHeaderContent: (left?: string, right?: string) => ReturnType
      updateFooterContent: (left?: string, right?: string) => ReturnType
    }
  }
}

