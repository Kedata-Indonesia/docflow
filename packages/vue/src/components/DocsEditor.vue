<script setup lang="ts">
import { type DocsEditor, type DocsEditorPlugin, type EditorOptions } from '@kedata-indonesia/docflow-core'
import { PAGE_SIZES, getPageSize } from '@kedata-indonesia/docflow-layout-engine'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useEditor } from '../composables/useEditor.js'
import type { Collaborator, ConnectionState, SavingStatus, SidebarKey } from '../types.js'
import HeaderBar from './HeaderBar.vue'
import EditorToolbar from './EditorToolbar.vue'
import BubbleMenu from './BubbleMenu.vue'
import StatusBar from './StatusBar.vue'
import RulerBar from './RulerBar.vue'
import VerticalRuler from './VerticalRuler.vue'
import QuickActionChips from './QuickActionChips.vue'
import { useTheme } from '../composables/useTheme.js'

const props = withDefaults(
  defineProps<{
    modelValue?: object | string
    plugins?: DocsEditorPlugin[]
    editable?: boolean
    collaboration?: NonNullable<EditorOptions['collaboration']>
    pageSize?: string
    title?: string
    collaborators?: Collaborator[]
    starred?: boolean
    connectionState?: ConnectionState
    userName?: string
    userAvatar?: string
  }>(),
  {
    editable: true,
    modelValue: undefined,
    plugins: () => [],
    collaboration: undefined,
    pageSize: 'a4',
    title: 'Untitled Document',
    collaborators: () => [],
    starred: false,
    connectionState: 'connected',
    userName: '',
    userAvatar: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: object]
  'update:title': [title: string]
  'update:pageSize': [pageSize: string]
  'toggle-star': []
  back: []
  share: []
  'menu-click': [menu: string]
  ready: [docsEditor: DocsEditor]
}>()

// ─── Page Size ────────────────────────────────────────────────────────────────

const defaultMargins = { top: 72, bottom: 72, left: 90, right: 90 }

const pageSizeId = ref(props.pageSize ?? 'a4')
const isPageless = ref(false)

const resolvedLayoutOptions = computed(() => {
  const size = getPageSize(pageSizeId.value) ?? PAGE_SIZES[0]
  let w = size.pageWidth; let h = size.pageHeight
  if (isPageless.value) h = 9_999_999
  return { pageHeight: h, pageWidth: w, margins: { ...defaultMargins } }
})

const { isDark } = useTheme()

const paginationOptions = computed(() => ({
  enabled: !isPageless.value,
  pageHeight: resolvedLayoutOptions.value.pageHeight,
  pageWidth: resolvedLayoutOptions.value.pageWidth,
  marginTop: resolvedLayoutOptions.value.margins.top,
  marginBottom: resolvedLayoutOptions.value.margins.bottom,
  marginLeft: resolvedLayoutOptions.value.margins.left,
  marginRight: resolvedLayoutOptions.value.margins.right,
  contentMarginTop: 10,
  contentMarginBottom: 10,
  pageGap: 40,
  pageBreakBackground: isDark.value ? '#02040a' : '#f1f5f9',
  headerLeft: '',
  headerRight: '',
  footerLeft: '',
  footerRight: '',
  onHeaderClick: () => {
    openHeaderFooterModal()
  },
  onFooterClick: () => {
    openHeaderFooterModal()
  },
}))

// ─── Editor ───────────────────────────────────────────────────────────────────

interface TabItem { id: string; label: string; content: any }
interface TabbedDoc {
  type: 'tabbed-doc'
  activeTabId: string
  tabs: TabItem[]
  headerLeft?: string
  headerRight?: string
  footerLeft?: string
  footerRight?: string
}

const parseModelValue = (val: any): TabbedDoc => {
  if (val && typeof val === 'object' && val.type === 'tabbed-doc' && Array.isArray(val.tabs)) return val as TabbedDoc
  return { type: 'tabbed-doc', activeTabId: 'tab-1', tabs: [{ id: 'tab-1', label: 'Tab 1', content: val || { type: 'doc', content: [{ type: 'paragraph' }] } }] }
}

const initialDoc = parseModelValue(props.modelValue)
const userHeaderLeft = ref(initialDoc.headerLeft || '')
const userHeaderRight = ref(initialDoc.headerRight || '')
const userFooterLeft = ref(initialDoc.footerLeft || '')
const userFooterRight = ref(initialDoc.footerRight || '')

const tabs = ref<Array<{ id: string; label: string; active: boolean }>>(initialDoc.tabs.map(t => ({ id: t.id, label: t.label, active: t.id === initialDoc.activeTabId })))
const tabContents = ref<Record<string, any>>({})
initialDoc.tabs.forEach(t => { tabContents.value[t.id] = t.content })
const activeTabId = ref(initialDoc.activeTabId)
const activeTabContent = computed(() => tabContents.value[activeTabId.value])

const showBubbleMenu = ref(false)
const bubblePosition = ref<{ top: number; left: number } | null>(null)
const activeSidebar = ref<SidebarKey | null>(null)
const leftSidebarOpen = ref(true)
const wordCount = ref(0)
const charCount = ref(0)
const savingStatus = ref<SavingStatus>('saved')
const lastSaved = ref(Date.now())
const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const { editorRef, editor, pluginActions, isReady, docsEditor: docEditor } = useEditor({
  content: activeTabContent,
  plugins: props.plugins,
  editable: props.editable,
  collaboration: props.collaboration,
  getPageMap: () => new Map(),
  paginationOptions: paginationOptions.value,
  onUpdate: (json) => {
    tabContents.value[activeTabId.value] = json
    const fullDoc: TabbedDoc = {
      type: 'tabbed-doc',
      activeTabId: activeTabId.value,
      tabs: tabs.value.map(t => ({ id: t.id, label: t.label, content: tabContents.value[t.id] })),
      headerLeft: userHeaderLeft.value,
      headerRight: userHeaderRight.value,
      footerLeft: userFooterLeft.value,
      footerRight: userFooterRight.value,
    }
    emit('update:modelValue', fullDoc)
    savingStatus.value = 'saving'
    if (saveTimer.value) clearTimeout(saveTimer.value)
    saveTimer.value = setTimeout(() => { try { localStorage.setItem('docs-editor-current-doc', JSON.stringify(fullDoc)) } catch { /* ignore */ }; savingStatus.value = 'saved'; lastSaved.value = Date.now() }, 800)
  },
})

const isEmptyDocument = computed(() => {
  if (!editor.value) return true
  const json = editor.value.getJSON()
  if (!json.content || json.content.length === 0) return true
  return json.content.every((n: any) => n.type === 'paragraph' && (!n.content || n.content.length === 0))
})

const updateCounts = () => {
  const text = editor.value?.getText() ?? ''
  charCount.value = text.length
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0
}

const computeBubblePosition = (): { top: number; left: number } | null => {
  if (!editor.value) return null
  const { from, to } = editor.value.state.selection
  if (from === to) return null
  const coords = editor.value.view.coordsAtPos(from)
  if (!coords) return null
  return { top: coords.top - 48, left: coords.left + (coords.right - coords.left) / 2 }
}

const updateBubbleMenu = () => {
  if (!editor.value) { showBubbleMenu.value = false; bubblePosition.value = null; return }
  const { from, to } = editor.value.state.selection
  showBubbleMenu.value = from !== to
  bubblePosition.value = from !== to ? computeBubblePosition() : null
}

const scrollContainerRef = ref<HTMLDivElement | null>(null)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

const handleScroll = () => {
  if (!editor.value) return
  if (scrollTimeout) clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    if (editor.value) {
      editor.value.view.dispatch(editor.value.state.tr)
    }
  }, 150)
}

const pageCount = ref(1)
const currentPage = ref(1)

const updatePageStats = () => {
  if (!editor.value || !isReady.value) {
    pageCount.value = 1
    currentPage.value = 1
    return
  }

  const editorDom = editor.value.view.dom
  const paginationElement = editorDom.querySelector("[data-rm-pagination]")
  if (paginationElement) {
    pageCount.value = paginationElement.children.length || 1
  } else {
    pageCount.value = 1
  }

  try {
    const { selection } = editor.value.state
    const coords = editor.value.view.coordsAtPos(selection.head)
    if (coords && paginationElement) {
      const pageBreaks = Array.from(paginationElement.querySelectorAll(".rm-page-break"))
      const editorRect = editorDom.getBoundingClientRect()
      const selectionTopRelativeToEditor = coords.top - editorRect.top + editorDom.scrollTop

      let pageIndex = 1
      let found = false
      for (let i = 0; i < pageBreaks.length; i++) {
        const breaker = pageBreaks[i].querySelector(".breaker")
        if (breaker instanceof HTMLElement) {
          if (selectionTopRelativeToEditor < breaker.offsetTop) {
            currentPage.value = pageIndex
            found = true
            break
          }
        }
        pageIndex++
      }
      if (!found) {
        currentPage.value = pageIndex
      }
    } else {
      currentPage.value = 1
    }
  } catch {
    currentPage.value = 1
  }
}

watch(resolvedLayoutOptions, (newOptions) => {
  if (!editor.value) return
  
  editor.value.commands.updatePageHeight(newOptions.pageHeight)
  editor.value.commands.updatePageWidth(newOptions.pageWidth)
  editor.value.commands.updateMargins({
    top: newOptions.margins.top,
    bottom: newOptions.margins.bottom,
    left: newOptions.margins.left,
    right: newOptions.margins.right,
  })
  
  updatePageStats()
})

// Header & footer refs are defined above to support initialization from props

const applyHeaderFooter = () => {
  if (!editor.value || !isReady.value) return
  const resolvedHeaderLeft = userHeaderLeft.value.replace(/{total}/g, String(pageCount.value))
  const resolvedHeaderRight = userHeaderRight.value.replace(/{total}/g, String(pageCount.value))
  const resolvedFooterLeft = userFooterLeft.value.replace(/{total}/g, String(pageCount.value))
  const resolvedFooterRight = userFooterRight.value.replace(/{total}/g, String(pageCount.value))
  
  editor.value.commands.updateHeaderContent(resolvedHeaderLeft, resolvedHeaderRight)
  editor.value.commands.updateFooterContent(resolvedFooterLeft, resolvedFooterRight)
}

watch(pageCount, () => {
  applyHeaderFooter()
})

watch(isDark, (darkVal) => {
  if (editor.value) {
    editor.value.commands.updatePageBreakBackground(darkVal ? '#02040a' : '#f1f5f9')
  }
})



watch(isReady, (ready) => {
  if (ready && editor.value) {
    // Populate raw inputs from stored/loaded configuration if not already set by props
    if (!userHeaderLeft.value && !userHeaderRight.value && !userFooterLeft.value && !userFooterRight.value) {
      userHeaderLeft.value = editor.value.storage.PaginationPlus?.appliedConfig?.headerLeft || ''
      userHeaderRight.value = editor.value.storage.PaginationPlus?.appliedConfig?.headerRight || ''
      userFooterLeft.value = editor.value.storage.PaginationPlus?.appliedConfig?.footerLeft || ''
      userFooterRight.value = editor.value.storage.PaginationPlus?.appliedConfig?.footerRight || ''
    }

    // Apply header & footer with correct page stats
    applyHeaderFooter()

    emit('ready', docEditor.value)
    editor.value.on('selectionUpdate', () => {
      updateBubbleMenu()
      updatePageStats()
    })
    editor.value.on('transaction', () => {
      updatePageStats()
      updateCounts()
    })
    updateBubbleMenu()
    updateCounts()
    updatePageStats()
    setTimeout(() => editor.value?.commands.focus('start'), 50)

    // Run layout adjustments after intervals to support async collaboration content loads
    const intervals = [100, 300, 600, 1200, 2500]
    intervals.forEach((delay) => {
      setTimeout(() => {
        if (editor.value) {
          editor.value.view.dispatch(editor.value.state.tr)
        }
      }, delay)
    })
  }
})

watch(() => props.collaboration, () => {}, { deep: true })
onUnmounted(() => {
  if (saveTimer.value) clearTimeout(saveTimer.value)
  if (scrollTimeout) clearTimeout(scrollTimeout)
})

const showHeaderFooterModal = ref(false)
const headerLeftInput = ref('')
const headerRightInput = ref('')
const footerLeftInput = ref('')
const footerRightInput = ref('')

const openHeaderFooterModal = () => {
  if (!editor.value) return
  // Use either local raw inputs if customized in this session, or storage fallback
  headerLeftInput.value = userHeaderLeft.value || editor.value.storage.PaginationPlus?.appliedConfig?.headerLeft || ''
  headerRightInput.value = userHeaderRight.value || editor.value.storage.PaginationPlus?.appliedConfig?.headerRight || ''
  footerLeftInput.value = userFooterLeft.value || editor.value.storage.PaginationPlus?.appliedConfig?.footerLeft || ''
  footerRightInput.value = userFooterRight.value || editor.value.storage.PaginationPlus?.appliedConfig?.footerRight || ''
  showHeaderFooterModal.value = true
}

const saveHeaderFooter = () => {
  if (!editor.value) return
  userHeaderLeft.value = headerLeftInput.value
  userHeaderRight.value = headerRightInput.value
  userFooterLeft.value = footerLeftInput.value
  userFooterRight.value = footerRightInput.value
  
  applyHeaderFooter()

  // Manually update the persisted modelValue!
  const fullDoc: TabbedDoc = {
    type: 'tabbed-doc',
    activeTabId: activeTabId.value,
    tabs: tabs.value.map(t => ({ id: t.id, label: t.label, content: tabContents.value[t.id] })),
    headerLeft: userHeaderLeft.value,
    headerRight: userHeaderRight.value,
    footerLeft: userFooterLeft.value,
    footerRight: userFooterRight.value,
  }
  emit('update:modelValue', fullDoc)
  savingStatus.value = 'saving'
  if (saveTimer.value) clearTimeout(saveTimer.value)
  saveTimer.value = setTimeout(() => { try { localStorage.setItem('docs-editor-current-doc', JSON.stringify(fullDoc)) } catch { /* ignore */ }; savingStatus.value = 'saved'; lastSaved.value = Date.now() }, 800)

  showHeaderFooterModal.value = false
}

let menuClick = (action: string) => {
  if (action === 'insert-header' || action === 'insert-footer') {
    openHeaderFooterModal()
  } else if (action === 'insert-footnote') {
    // Use ProseMirror's transaction API directly — more reliable than chain()
    // because chain().focus() can fail when focus has left the editor via menu click.
    if (!editor.value) return
    const { state, view } = editor.value
    const footnoteType = state.schema.nodes['footnote']
    if (!footnoteType) {
      console.error('[DocsEditor] footnote node type not registered in schema')
      return
    }
    // Insert at the last known cursor position
    const insertPos = state.selection.head
    const footnoteNode = footnoteType.create({ content: '' })
    const tr = state.tr.insert(insertPos, footnoteNode)
    view.dispatch(tr)
    view.focus()

    // After DOM settles: build footnote list and focus the new text area
    setTimeout(() => {
      updateFootnotes()
      const items = document.querySelectorAll<HTMLElement>('.docs-footnote-item-text')
      const last = items[items.length - 1]
      if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        last.focus()
      }
    }, 160)
  } else {
    emit('menu-click', action)
  }
}
let toggleSidebar = (key: SidebarKey) => { activeSidebar.value = activeSidebar.value === key ? null : key }
let handlePrint = () => window.print()

// ─── Footnote (Catatan Kaki) ──────────────────────────────────────────────────

/**
 * Save edited footnote content from a contenteditable div back to the
 * ProseMirror node attribute when the user blurs the item.
 */
const saveFootnoteItemContent = (refEl: HTMLElement, newContent: string) => {
  if (!editor.value) return
  const view = editor.value.view
  view.state.doc.descendants((node, pos): boolean | undefined | void => {
    if (node.type.name === 'footnote') {
      if (view.nodeDOM(pos) === refEl) {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { content: newContent }))
        return false
      }
    }
    return undefined
  })
}

/**
 * Build / refresh the inline footnote area at the bottom of each page.
 * ─ Numbers the inline <sup> refs per-page (restarting at 1).
 * ─ Creates contenteditable footnote items that sync back to ProseMirror on blur.
 * ─ Skips rebuilding any page whose footnote area is currently focused.
 */
const updateFootnotes = () => {
  if (!editor.value || !isReady.value) return
  const editorDom = editor.value.view.dom

  const paginationEl = editorDom.querySelector('[data-rm-pagination]')
  if (!paginationEl) return

  const pageBreaks = Array.from(paginationEl.querySelectorAll<HTMLElement>('.rm-page-break'))
  const allRefs = Array.from(editorDom.querySelectorAll<HTMLElement>('.docs-footnote-ref'))

  if (pageBreaks.length === 0) {
    // Pageless mode or layout not computed yet: render footnotes at the very bottom of the paper
    allRefs.forEach((ref, i) => { ref.textContent = String(i + 1) })

    // Find paper container
    const paper = editorRef.value
    if (!paper) return

    // Remove existing pageless container
    paper.querySelector('.docs-pageless-footnotes')?.remove()

    if (allRefs.length === 0) return

    // Skip if a footnote text input inside this container is currently focused
    const existing = paper.querySelector<HTMLElement>('.docs-pageless-footnotes')
    if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

    const container = document.createElement('div')
    container.className = 'docs-page-footnotes docs-pageless-footnotes'

    const sep = document.createElement('div')
    sep.className = 'docs-footnotes-sep'
    container.appendChild(sep)

    allRefs.forEach((ref, n) => {
      const content = ref.getAttribute('data-footnote-content') ?? ''
      const row = document.createElement('div')
      row.className = 'docs-footnote-item'

      const num = document.createElement('sup')
      num.className = 'docs-footnote-item-num'
      num.textContent = String(n + 1)

      const textDiv = document.createElement('div')
      textDiv.className = 'docs-footnote-item-text'
      textDiv.contentEditable = 'true'
      textDiv.textContent = content
      if (!content) textDiv.setAttribute('data-empty', 'true')

      textDiv.addEventListener('input', () => {
        textDiv.removeAttribute('data-empty')
        if (!textDiv.textContent) textDiv.setAttribute('data-empty', 'true')
      })

      textDiv.addEventListener('blur', () => {
        const newContent = textDiv.textContent?.trim() ?? ''
        saveFootnoteItemContent(ref, newContent)
      })

      ref.dataset.footnoteItemId = `fn-pageless-${n}`
      row.id = `fn-pageless-${n}`

      row.appendChild(num)
      row.appendChild(textDiv)
      container.appendChild(row)
    })

    paper.appendChild(container)
    return
  }


  // Map page index → footnote refs on that page
  const pageRefs = new Map<number, HTMLElement[]>()
  pageBreaks.forEach((_, i) => pageRefs.set(i, []))

  allRefs.forEach(ref => {
    const top = ref.getBoundingClientRect().top
    let assigned = pageBreaks.length - 1
    for (let i = 0; i < pageBreaks.length - 1; i++) {
      const breaker = pageBreaks[i].querySelector<HTMLElement>('.breaker')
      if (breaker && top < breaker.getBoundingClientRect().top) { assigned = i; break }
    }
    pageRefs.get(assigned)!.push(ref)
  })

  pageBreaks.forEach((pb, pageIdx) => {
    const refs = pageRefs.get(pageIdx) ?? []

    // Number inline refs
    refs.forEach((ref, n) => { ref.textContent = String(n + 1) })

    // Skip rebuild if a footnote item on this page has focus
    const existing = pb.querySelector<HTMLElement>('.docs-page-footnotes')
    if (existing?.querySelector<HTMLElement>('.docs-footnote-item-text:focus')) return

    existing?.remove()
    if (refs.length === 0) return

    // Build inline footnote area
    const container = document.createElement('div')
    container.className = 'docs-page-footnotes'

    // Separator line
    const sep = document.createElement('div')
    sep.className = 'docs-footnotes-sep'
    container.appendChild(sep)

    refs.forEach((ref, n) => {
      const content = ref.getAttribute('data-footnote-content') ?? ''

      const row = document.createElement('div')
      row.className = 'docs-footnote-item'

      const num = document.createElement('sup')
      num.className = 'docs-footnote-item-num'
      num.textContent = String(n + 1)

      const textDiv = document.createElement('div')
      textDiv.className = 'docs-footnote-item-text'
      textDiv.contentEditable = 'true'
      textDiv.textContent = content
      if (!content) textDiv.setAttribute('data-empty', 'true')

      textDiv.addEventListener('input', () => {
        textDiv.removeAttribute('data-empty')
        if (!textDiv.textContent) textDiv.setAttribute('data-empty', 'true')
      })

      textDiv.addEventListener('blur', () => {
        const newContent = textDiv.textContent?.trim() ?? ''
        saveFootnoteItemContent(ref, newContent)
      })

      // Clicking the sup ref in the text jumps here
      ref.dataset.footnoteItemId = `fn-${pageIdx}-${n}`
      row.id = `fn-${pageIdx}-${n}`

      row.appendChild(num)
      row.appendChild(textDiv)
      container.appendChild(row)
    })

    // Find the page breaker (the layout divider which contains the footer)
    const breaker = pb.querySelector('.breaker')
    if (breaker) {
      // Prepend so it sits exactly above the footer content inside the breaker
      breaker.insertBefore(container, breaker.firstChild)
    } else {
      pb.appendChild(container)
    }
  })
}


// Click on sup ref → scroll to + focus corresponding footnote item
watch(isReady, (ready) => {
  if (!ready || !editor.value) return
  editor.value.view.dom.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('.docs-footnote-ref')
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    const id = target.dataset.footnoteItemId
    if (!id) return
    const itemRow = document.getElementById(id)
    const textEl = itemRow?.querySelector<HTMLElement>('.docs-footnote-item-text')
    if (textEl) {
      textEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      textEl.focus()
      // Place cursor at end
      const range = document.createRange()
      range.selectNodeContents(textEl)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  })
})

// Re-render footnotes after each editor update & lifecycle changes
watch(isReady, (ready) => {
  if (!ready || !editor.value) return

  // Run immediately
  setTimeout(updateFootnotes, 150)

  // Run on update & selection changes
  editor.value.on('update', () => { setTimeout(updateFootnotes, 60) })
  editor.value.on('selectionUpdate', () => { setTimeout(updateFootnotes, 100) })

  // Listen to window resize because pagination calculations layout can shift
  window.addEventListener('resize', updateFootnotes)
})
</script>

<template>
  <div class="docs-editor flex h-screen w-full flex-col overflow-hidden bg-slate-50 transition-colors dark:bg-[#02040a]">
    <HeaderBar :title="title" :editable="editable" :collaborators="collaborators" :starred="starred" :user-name="userName" :user-avatar="userAvatar"
      @menu-click="menuClick" @back="$emit('back')" @update:title="$emit('update:title', $event)" @toggle-star="$emit('toggle-star')"
      @export="() => {}" @share="$emit('share')"><template #actions><slot name="header-actions" /></template></HeaderBar>
    <EditorToolbar :actions="pluginActions" :plugins="plugins" :editor="editor" :active-sidebar="activeSidebar"
      @toggle-sidebar="toggleSidebar"       @print="handlePrint" @toggle-left-sidebar="leftSidebarOpen = !leftSidebarOpen" />
    <RulerBar :layout-options="resolvedLayoutOptions" />
    <BubbleMenu :visible="showBubbleMenu" :actions="pluginActions" :position="bubblePosition" :editor="editor" />
    <div class="docs-editor__body flex flex-1 overflow-hidden">
      <div ref="scrollContainerRef" class="docs-editor-scroll relative flex flex-1 overflow-auto px-4 py-6 bg-slate-100 dark:bg-[#02040a]" @scroll="handleScroll">
        <VerticalRuler :layout-options="resolvedLayoutOptions" />
        <div class="flex flex-1 flex-col items-center gap-4 w-full relative">
          <QuickActionChips :visible="isReady && isEmptyDocument" @meeting-notes="() => {}" @email-draft="() => {}" @more="() => {}" />
          
          <div class="relative w-full max-w-[794px]">
            <!-- Loading Indicator Overlay -->
            <div v-if="!isReady" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white dark:bg-[#0e1525]/60 backdrop-blur-[2px] gap-3 rounded-lg" aria-label="Loading document">
            </div>

            <!-- Editor -->
            <div ref="editorRef" class="docs-editor__paper outline-none text-slate-800 dark:text-[#e2e8f0]" :class="{ 'opacity-40': !isReady }" />
          </div>
        </div>
      </div>
    </div>
    <StatusBar :connection-state="connectionState" :saving-status="savingStatus" :last-saved="lastSaved"
      :word-count="wordCount" :char-count="charCount" :page-count="pageCount" :current-page="currentPage"
      :page-size="pageSizeId" :page-sizes="PAGE_SIZES"
      @update:page-size="pageSizeId = $event; emit('update:pageSize', $event)" />

    <!-- Dialog Header & Footer Customization -->
    <div v-if="showHeaderFooterModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0e1525] text-slate-800 dark:text-slate-200">
        <h2 class="text-lg font-bold mb-4">Penyesuaian Header & Footer</h2>
        
        <!-- Header Section -->
        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400">Header</h3>
            <button @click="headerLeftInput = ''; headerRightInput = ''" type="button" class="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors">Kosongkan</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] font-medium block mb-1">Header Kiri</label>
              <input v-model="headerLeftInput" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" placeholder="Contoh: Judul Dokumen">
            </div>
            <div>
              <label class="text-[11px] font-medium block mb-1">Header Kanan</label>
              <input v-model="headerRightInput" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" placeholder="Contoh: Page {page}">
            </div>
          </div>
        </div>

        <!-- Footer Section -->
        <div class="mb-6">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400">Footer</h3>
            <button @click="footerLeftInput = ''; footerRightInput = ''" type="button" class="text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors">Kosongkan</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] font-medium block mb-1">Footer Kiri</label>
              <input v-model="footerLeftInput" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" placeholder="Contoh: Rahasia">
            </div>
            <div>
              <label class="text-[11px] font-medium block mb-1">Footer Kanan</label>
              <input v-model="footerRightInput" type="text" class="w-full rounded-md border border-slate-200 bg-transparent px-3 py-1.5 text-xs focus:outline-none dark:border-slate-700" placeholder="Contoh: Page {page} of {total}">
            </div>
          </div>
        </div>

        <!-- Variables Info -->
        <div class="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-white/5 dark:text-slate-400 mb-6">
          <span class="font-bold">Info Variabel:</span> Anda dapat menggunakan <code>{page}</code> untuk nomor halaman aktif, dan <code>{total}</code> untuk jumlah halaman.
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2">
          <button @click="showHeaderFooterModal = false" type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5">
            Batal
          </button>
          <button @click="saveHeaderFooter" type="button" class="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            Simpan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-editor__paper {
  background-color: #ffffff !important;
  border-radius: 4px;
}
:global(.dark) .docs-editor__paper {
  background-color: #1e293b !important;
}
</style>
