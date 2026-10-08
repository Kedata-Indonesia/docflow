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
  /** Document content (ProseMirror JSON). Two-way bound via `v-model`. */
  modelValue?: object | string
  /** Active plugins — usually `defaultPlugins` from `@kedataindo/docflow-plugins`. */
  plugins?: DocsEditorPlugin[]
  /**
   * Let the user edit the document. Reactive after mount: toggling it calls
   * `editor.setEditable()` instead of requiring a remount.
   */
  editable?: boolean
  /** Collaboration config (`room`, `provider`, `user`) — the host owns the transport. */
  collaboration?: NonNullable<EditorOptions['collaboration']>
  /**
   * Page size id (`a4`, `f4`, `letter`, `legal`, `a5`). Reactive after mount:
   * changing it re-lays out the paper instead of requiring a remount.
   */
  pageSize?: string
  /** Continuous mode: disables pagination so the document flows without page breaks. */
  pageless?: boolean
  /**
   * Enable virtual page overlay (experimental).
   * When true, only visible pages are rendered in DOM instead of all pages.
   * Uses PageLayout for measurement + viewport-based visibility tracking.
   */
  virtualPages?: boolean
  /** Document title shown in the header bar. */
  title?: string
  /** Other users shown as the presence avatar stack in the header. */
  collaborators?: Collaborator[]
  /** Star toggle state shown in the header bar. */
  starred?: boolean
  /** Connection indicator rendered in the status bar. */
  connectionState?: ConnectionState
  /** Display name of the current user. */
  userName?: string
  /** Avatar fallback (initials) for the current user. */
  userAvatar?: string
  /** UI language for the editor chrome (`en` or `id`). */
  locale?: Locale
  /** Document metadata (id, owner, timestamps, counts) shown in the Details dialog. */
  documentMeta?: DocumentMeta
  /** Link used by the share-via-email dialog. */
  shareUrl?: string
  /** Async handler for pasted/dropped images; returns the stored `src`. The host owns storage. */
  onImageUpload?: ImageUploadHandler
  /** Citations port: CSL-JSON sources + active style. The host supplies the data. */
  citation?: CitationPort
  /** Streaming AI handler — the host calls its own LLM. */
  aiStream?: AIStreamFn
  /** Draft-generation handler used by the AI sidebar — the host calls its own LLM. */
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
  /** Index of the snapshot currently previewed in the history sidebar. */
  activePreviewIndex?: number | null
  /** Page orientation: 'portrait' or 'landscape'. Persisted by the host. */
  orientation?: 'portrait' | 'landscape'
  /** Page margins in points. Persisted by the host. */
  margins?: { top: number; bottom: number; left: number; right: number }
  /** Distance from the paper edge to the header/footer content, in cm. */
  headerMarginCm?: number
  /** Distance from the bottom paper edge to the footer content, in cm. */
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
  /** Document content changed (`v-model`). */
  'update:modelValue': [value: object]
  /** Document title changed. */
  'update:title': [title: string]
  /** Page size changed. */
  'update:pageSize': [pageSize: string]
  /** Page orientation changed. */
  'update:orientation': [orientation: 'portrait' | 'landscape']
  /** Page margins changed (points). */
  'update:margins': [margins: { top: number; bottom: number; left: number; right: number }]
  /** Header/footer margin offsets changed (cm). */
  'update:header-footer-margins': [margins: { headerMarginCm: number; footerMarginCm: number }]
  /** Pageless (continuous) mode was toggled. */
  'update:pageless': [pageless: boolean]
  /** The rendered page count changed. */
  'update:pageCount': [pageCount: number]
  /** UI language changed. */
  'update:locale': [locale: Locale]
  /** The citation source list changed. */
  'citation-sources-change': [sources: CslItemData[]]
  /** The active CSL style changed. */
  'update:citation-style': [style: string]
  /** The star toggle was clicked. */
  'toggle-star': []
  /** The back button was clicked. */
  back: []
  /** The share button was clicked. */
  share: []
  /** A header menu entry was activated; `menu` holds the action id. */
  'menu-click': [menu: string]
  /** The user requested an export in the given `format`. */
  export: [format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf']
  /** The editor instance is ready. */
  ready: [docsEditor: DocsEditor]
  // Phase 9 P9-4 — comment-thread events. The host owns the REST
  // surface; the editor just re-emits what the CommentsSidebar
  // collects from the user.
  /** The user submitted a new comment thread. */
  'add-comment': [content: string, anchorText?: string, anchorIndex?: number]
  /** The user replied to a comment thread. */
  'add-reply': [threadId: string, content: string]
  /** The user resolved a comment thread. */
  'resolve-comment': [threadId: string]
  // Issue #133 — orphaned comment threads. The sidebar re-emits a
  // delete request for threads whose anchored text is gone; the host
  // owns the REST surface (the existing DELETE endpoint + the
  // `comment:deleted` WS broadcast handles peer fan-out).
  /** The user asked to delete an orphaned comment thread. */
  'delete-comment': [threadId: string]
  // Phase 9 — version-history events. The host owns the REST surface;
  // the editor just re-emits what the HistorySidebar collects.
  /** The user saved a version snapshot. */
  'save-snapshot': [name: string]
  /** The user restored the snapshot at `versionIndex`. */
  'restore-snapshot': [versionIndex: number]
  /** The user previewed a snapshot (or cleared the preview with `null`). */
  'preview-snapshot': [snapshot: DocumentSnapshot | null]
}
