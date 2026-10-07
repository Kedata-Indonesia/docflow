import type {
  DocsEditor,
  DocsEditorPlugin,
  EditorOptions,
  ImageUploadHandler,
  CitationPort,
  CslItemData,
  AIStreamFn,
  AIDraftFn,
} from '@kedata-indonesia/docflow-core'
import type {
  Collaborator,
  CommentItem,
  ConnectionState,
  DocumentMeta,
  DocumentSnapshot,
} from '../types.js'
import type { Locale } from '../composables/useLocale.js'

export interface DocsEditorProps {
  modelValue?: object | string
  plugins?: DocsEditorPlugin[]
  /**
   * Let the user edit the document. Reactive after mount: toggling it calls
   * `editor.setEditable()` instead of requiring a remount.
   */
  editable?: boolean
  collaboration?: NonNullable<EditorOptions['collaboration']>
  /**
   * Page size id (`a4`, `f4`, `letter`, `legal`, `a5`). Reactive after mount:
   * changing it re-lays out the paper instead of requiring a remount.
   */
  pageSize?: string
  pageless?: boolean
  /**
   * Enable virtual page overlay (experimental).
   * When true, only visible pages are rendered in DOM instead of all pages.
   * Uses PageLayout for measurement + viewport-based visibility tracking.
   */
  virtualPages?: boolean
  title?: string
  collaborators?: Collaborator[]
  starred?: boolean
  connectionState?: ConnectionState
  userName?: string
  userAvatar?: string
  locale?: Locale
  documentMeta?: DocumentMeta
  shareUrl?: string
  onImageUpload?: ImageUploadHandler
  citation?: CitationPort
  aiStream?: AIStreamFn
  aiDraft?: AIDraftFn
  /**
   * Enable the debug overlay (CPU + RAM monitor) pinned to the bottom-right
   * corner of the viewport. Pure debug view — never touches document state.
   * Defaults to `false`, so production consumers are unaffected.
   * Read once at mount: the monitor is created together with the editor, so
   * changing this prop later requires a remount (`:key`).
   */
  debug?: boolean
  // Phase 9 P9-4 — comment threads. The library stays free of REST;
  // the host feeds the threads + handles the events.
  comments?: CommentItem[]
  /** Currently-selected text snippet. */
  selectedTextSnippet?: string
  /** Currently-selected start position (Phase 9 P9-4 anchor). */
  selectedTextIndex?: number
  // Phase 9 — version history. The host feeds the version list +
  // handles save/restore/preview events (it owns the REST surface).
  snapshots?: DocumentSnapshot[]
  activePreviewIndex?: number | null
  /** Page orientation: 'portrait' or 'landscape'. Persisted by the host. */
  orientation?: 'portrait' | 'landscape'
  /** Page margins in points. Persisted by the host. */
  margins?: { top: number; bottom: number; left: number; right: number }
  /** Distance from the paper edge to the header/footer content, in cm. */
  headerMarginCm?: number
  footerMarginCm?: number
}

export const docsEditorPropDefaults = {
  editable: true,
  modelValue: undefined,
  plugins: () => [],
  collaboration: undefined,
  pageSize: 'a4',
  pageless: false,
  virtualPages: false,
  title: 'Untitled Document',
  collaborators: () => [],
  starred: false,
  connectionState: 'connected' as const,
  userName: '',
  userAvatar: '',
  locale: undefined,
  documentMeta: undefined,
  shareUrl: '',
  onImageUpload: undefined,
  citation: undefined,
  aiStream: undefined,
  aiDraft: undefined,
  debug: false,
  comments: () => [],
  selectedTextSnippet: '',
  selectedTextIndex: undefined,
  snapshots: () => [],
  activePreviewIndex: null,
  orientation: 'portrait' as const,
  margins: () => ({ top: 94, bottom: 94, left: 94, right: 94 }),
  headerMarginCm: 0.5,
  footerMarginCm: 0.5,
} satisfies Record<keyof Required<DocsEditorProps>, unknown>

export interface DocsEditorEmits {
  'update:modelValue': [value: object]
  'update:title': [title: string]
  'update:pageSize': [pageSize: string]
  'update:orientation': [orientation: 'portrait' | 'landscape']
  'update:margins': [margins: { top: number; bottom: number; left: number; right: number }]
  'update:header-footer-margins': [margins: { headerMarginCm: number; footerMarginCm: number }]
  'update:pageless': [pageless: boolean]
  'update:pageCount': [pageCount: number]
  'update:locale': [locale: Locale]
  'citation-sources-change': [sources: CslItemData[]]
  'update:citation-style': [style: string]
  'toggle-star': []
  back: []
  share: []
  'menu-click': [menu: string]
  export: [format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf']
  ready: [docsEditor: DocsEditor]
  // Phase 9 P9-4 — comment-thread events. The host owns the REST
  // surface; the editor just re-emits what the CommentsSidebar
  // collects from the user.
  'add-comment': [content: string, anchorText?: string, anchorIndex?: number]
  'add-reply': [threadId: string, content: string]
  'resolve-comment': [threadId: string]
  // Issue #133 — orphaned comment threads. The sidebar re-emits a
  // delete request for threads whose anchored text is gone; the host
  // owns the REST surface (the existing DELETE endpoint + the
  // `comment:deleted` WS broadcast handles peer fan-out).
  'delete-comment': [threadId: string]
  // Phase 9 — version-history events. The host owns the REST surface;
  // the editor just re-emits what the HistorySidebar collects.
  'save-snapshot': [name: string]
  'restore-snapshot': [versionIndex: number]
  'preview-snapshot': [snapshot: DocumentSnapshot | null]
}
