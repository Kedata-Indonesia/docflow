import type { EmitFn, Ref } from 'vue'
import type {
  CitationPort,
  DocsEditorPlugin,
  EditorOptions,
} from '@kedata-indonesia/docflow-core'
import type { CommentItem } from '../types.js'
import type { DocsEditorEmits } from '../components/docsEditorContracts.js'
import type { HeaderFooterValues } from './useDocumentModel.js'
import type { LocaleContext } from './useLocale.js'
import { useDocumentModel } from './useDocumentModel.js'
import { useEditorChrome } from './useEditorChrome.js'
import { useCitations } from './useCitations.js'
import { useEditor } from './useEditor.js'
import { useCommentAnchors } from './useCommentAnchors.js'
import { useBubbleMenu } from './useBubbleMenu.js'
import { useLinkDialog } from './useLinkDialog.js'

export interface UseDocsEditorSessionOptions {
  emit: EmitFn<DocsEditorEmits>
  t: LocaleContext['t']
  modelValue: object | string | undefined
  /** Plugin list is read lazily so slash-command changes stay reactive. */
  getPlugins: () => DocsEditorPlugin[]
  editable: boolean | Ref<boolean>
  collaboration: NonNullable<EditorOptions['collaboration']> | undefined
  onImageUpload: EditorOptions['onImageUpload']
  /** The host citation port is read lazily so the port stays current. */
  getCitation: () => CitationPort | undefined
  aiStream: EditorOptions['aiStream']
  aiDraft: EditorOptions['aiDraft']
  debug: boolean
  /** Comment list is read lazily so the orphan computed stays reactive. */
  getComments: () => CommentItem[]
  /** Collaboration config is read lazily (props can change after mount). */
  getCollaboration: () => EditorOptions['collaboration']
  /** Header/footer slots live on a composable created after this one. */
  getHeaderFooter: () => HeaderFooterValues
  paginationOptions: NonNullable<EditorOptions['paginationOptions']>
}

/**
 * The editor session: the tabbed document model + persistence port, the editor
 * chrome (sidebar / focus mode / scroll container), the reference library, the
 * ProseMirror editor instance itself, the comment-anchor scan, the bubble menu
 * and the link dialog.
 *
 * Created as one unit because these pieces share a strict creation order and a
 * web of lazy getters (the editor is created after the model and chrome, the
 * header/footer slots after all of them). Nothing here writes to the document
 * outside the ProseMirror commands the editor already owns.
 */
export function useDocsEditorSession(options: UseDocsEditorSessionOptions) {
  const {
    emit, t, getPlugins, getCitation, getComments, getCollaboration, getHeaderFooter, paginationOptions,
  } = options

  // ─── Document model ──────────────────────────────────────────────────────────
  // Created first: the editor, header/footer and edit-command composables all
  // consume the active tab content / persistence port it owns. Header/footer
  // slots live on a composable created later, so they are read lazily.
  const {
    initialDoc,
    activeTabContent,
    wordCount,
    charCount,
    savingStatus,
    lastSaved,
    saveTimer,
    tabContents,
    activeTabId,
    persistCurrentDoc,
    updateCounts,
    slashCommands,
  } = useDocumentModel({
    modelValue: options.modelValue,
    getPlugins,
    emit,
    getHeaderFooter,
    getEditor: () => editor.value,
  })

  // Chrome state is created before `useCitations` (activeSidebar) and the
  // edit-command composable (focusMode). The editor instance is created later,
  // so it is passed as a lazy getter.
  const {
    activeSidebar,
    showRuler,
    focusMode,
    scrollContainerRef,
    handleScroll,
    toggleSidebar,
    handlePrint,
  } = useEditorChrome({
    getEditor: () => editor.value,
  })

  // ─── References / citations (Phase 6B) ───────────────────────────────────────
  // The host seeds the reference library through the CitationPort; the editor
  // then owns a live copy so sidebar CRUD re-renders citations immediately.
  // Hosts that persist (apps/web) listen to `citation-sources-change`. The
  // editor and plugin actions are created below, so they are read lazily.
  const {
    citationSources,
    citationStyleId,
    pendingSourceRequest,
    citationPort,
    handleSourceCreate,
    handleSourceUpdate,
    handleSourceRemove,
    handleCitationStyleChange,
    handleReferenceInsert,
    importBusy,
    importMessage,
    canImportSources,
    handleImportDoi,
    handleImportBibliography,
  } = useCitations({
    getEditor: () => editor.value,
    getPluginActions: () => pluginActions.value,
    getCitation,
    emit,
    t,
    activeSidebar,
  })

  const { editorRef, editor, pluginActions, isReady, docsEditor: docEditor } = useEditor({
    content: activeTabContent,
    plugins: getPlugins(),
    editable: options.editable,
    collaboration: options.collaboration,
    onImageUpload: options.onImageUpload,
    citation: citationPort.value,
    aiStream: options.aiStream,
    aiDraft: options.aiDraft,
    debug: options.debug,
    getPageMap: () => new Map(),
    paginationOptions,
    onUpdate: (json) => {
      tabContents.value[activeTabId.value] = json
      persistCurrentDoc()
    },
  })

  // ─── Comment anchors (Issue #133) ────────────────────────────────────────────
  // The scan walks ProseMirror `comment` marks, so it is wired here and triggered
  // from the `transaction` listener further down.
  const { orphanedCommentIds, scheduleCommentAnchorScan } = useCommentAnchors({
    editor,
    isReady,
    getCollaboration,
    getComments,
  })

  // ─── Bubble menu ─────────────────────────────────────────────────────────────
  const {
    showBubbleMenu,
    bubblePosition,
    updateBubbleMenu,
    computeBubblePosition,
  } = useBubbleMenu({ editor })

  // ─── Link dialog ─────────────────────────────────────────────────────────────
  // Consumed by the ready hook (the ⌘K binding) and the insert-link menu action,
  // so it must be created before both.
  const {
    showLinkDialog,
    linkDialogInitialText,
    linkDialogInitialUrl,
    linkDialogIsEditing,
    openLinkDialog,
    applyLinkDialog,
    removeLink,
  } = useLinkDialog({ editor })

  return {
    initialDoc,
    persistCurrentDoc,
    updateCounts,
    saveTimer,
    slashCommands,
    wordCount,
    charCount,
    savingStatus,
    lastSaved,
    activeSidebar,
    showRuler,
    focusMode,
    scrollContainerRef,
    handleScroll,
    toggleSidebar,
    handlePrint,
    citationSources,
    citationStyleId,
    pendingSourceRequest,
    handleSourceCreate,
    handleSourceUpdate,
    handleSourceRemove,
    handleCitationStyleChange,
    handleReferenceInsert,
    importBusy,
    importMessage,
    canImportSources,
    handleImportDoi,
    handleImportBibliography,
    editorRef,
    editor,
    pluginActions,
    isReady,
    docEditor,
    orphanedCommentIds,
    scheduleCommentAnchorScan,
    showBubbleMenu,
    bubblePosition,
    updateBubbleMenu,
    computeBubblePosition,
    showLinkDialog,
    linkDialogInitialText,
    linkDialogInitialUrl,
    linkDialogIsEditing,
    openLinkDialog,
    applyLinkDialog,
    removeLink,
  }
}
