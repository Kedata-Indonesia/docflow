import { AnyExtension, Editor as TiptapEditor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Code } from '@tiptap/extension-code'
import {
  collectExtensions,
  createActionMap,
  type DocsEditorPlugin,
} from './PluginSystem.js'
import {
  collaborationExtensions,
  createCollaboration,
  type CollaborationOptions,
  type CollaborationSetup,
} from './Collaboration.js'
import { BlockAttributesExtension } from './BlockAttributes.js'
import { EditorContextExtension } from './EditorContext.js'
import { IndentBackspaceExtension, IndentExtension } from './Indent.js'
import { ManualColumnResize } from './ManualColumnResize.js'
import { SearchAndReplaceExtension } from './SearchAndReplace.js'
import type { ImageUploadHandler, CitationPort } from './ports.js'
import type { AIStreamFn, AIDraftFn } from './ai/types.js'
import { PaginationPlus, type PaginationPlusOptions } from 'tiptap-pagination-plus'
import { createPerformanceMonitor, type PerformanceMonitor } from './PerformanceMonitor.js'

/**
 * Pasted-HTML normalization now lives in ./pasteNormalization.js (DOM-based
 * pipeline, Stage 2 — see docs/plans/clipboard-paste-pipeline-plan.md).
 * sanitizePastedHTML is kept as the backward-compatible export name.
 */
import {
  normalizeClipboardHTML,
  sanitizePastedHTML,
  detectClipboardSource,
  type ClipboardSource,
} from './pasteNormalization.js'

export {
  normalizeClipboardHTML,
  sanitizePastedHTML,
  detectClipboardSource,
  type ClipboardSource,
}

// FontSizeExtension is no longer hardcoded here — it is registered
// by fontSizePlugin (packages/plugins/src/fontSize.ts) to avoid
// duplicate extension name collisions caused by Vite modualiasi.

export interface EditorOptions {
  target?: HTMLElement
  content?: object | string
  plugins?: DocsEditorPlugin[]
  editable?: boolean
  onUpdate?: (json: object) => void
  collaboration?: CollaborationOptions | CollaborationSetup
  getPageMap?: () => Map<number, { page: number; blockIndex: number }>
  paginationOptions?: Partial<PaginationPlusOptions>
  /** Host-injected image upload port (see docs/LIBRARY_CONTRACT.md). */
  onImageUpload?: ImageUploadHandler
  /** Host-injected citation port (Phase 6 — reference library + CSL styles). */
  citation?: CitationPort
  /** Host-injected AI transport (Phase 7 — editor → server → LLM). */
  aiStream?: AIStreamFn
  /** Host-injected cited-draft transport (Phase 7E — editor → server → RAG LLM). */
  aiDraft?: AIDraftFn
  /**
   * Enable the debug overlay (CPU + RAM monitor) pinned to the bottom-right
   * corner of the viewport. Pure debug view — never touches document state.
   * Defaults to `false`, so production consumers are unaffected.
   */
  debug?: boolean
}

export interface DocsEditor {
  editor: TiptapEditor
  collab?: CollaborationSetup
  getJSON: () => object
  getHTML: () => string
  destroy: () => void
  use: (plugin: DocsEditorPlugin) => void
  pluginActions: Record<string, (...args: unknown[]) => boolean>
  /** Active performance monitor when `debug: true` was set (undefined otherwise). */
  performanceMonitor?: PerformanceMonitor
}

/**
 * Rename the legacy `bibliography` node (cited-only) to `referenceList` so old
 * documents keep their block under the new split (issue #252). The new
 * all-saved-sources bibliography carries `attrs.citationModel === 2` and is
 * left untouched.
 */
function migrateCitationBlocks(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(migrateCitationBlocks)
  if (typeof node !== 'object' || node === null) return node

  const obj = node as Record<string, unknown>
  const attrs = obj.attrs as Record<string, unknown> | undefined
  const isLegacyBibliography = obj.type === 'bibliography' && attrs?.citationModel !== 2
  const result: Record<string, unknown> = isLegacyBibliography
    ? { ...obj, type: 'referenceList' }
    : { ...obj }

  if (Array.isArray(result.content)) result.content = result.content.map(migrateCitationBlocks)
  if (Array.isArray(result.tabs)) {
    result.tabs = (result.tabs as unknown[]).map((tab) => {
      if (tab && typeof tab === 'object') {
        const tabObj = tab as Record<string, unknown>
        return { ...tabObj, content: migrateCitationBlocks(tabObj.content) }
      }
      return tab
    })
  }
  return result
}

export function migrateContent(content: unknown): unknown {
  if (!content) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown
      return JSON.stringify(migrateContent(parsed))
    } catch {
      return content
    }
  }
  if (typeof content !== 'object' || content === null) return content

  const obj = content as Record<string, unknown>
  let migrated: unknown = content

  if (obj.type === 'doc' && Array.isArray(obj.content)) {
    const newContentList: unknown[] = []
    for (const child of obj.content) {
      const childObj = child as Record<string, unknown> | null
      if (childObj && childObj.type === 'page' && Array.isArray(childObj.content)) {
        newContentList.push(...childObj.content)
      } else {
        newContentList.push(child)
      }
    }
    migrated = { ...obj, content: newContentList }
  } else if (obj.type === 'tabbed-doc' && Array.isArray(obj.tabs)) {
    migrated = {
      ...obj,
      tabs: obj.tabs.map((tab) => ({
        ...(tab as Record<string, unknown>),
        content: migrateContent((tab as Record<string, unknown>).content),
      })),
    }
  }

  return migrateCitationBlocks(migrated)
}

export function createEditor(options: EditorOptions = {}): DocsEditor {
  const migratedOptions = {
    ...options,
    content: options.content ? (migrateContent(options.content) as string | object | undefined) : options.content
  }
  const plugins = migratedOptions.plugins ?? []
  const collaborationSetup: CollaborationSetup | undefined =
    !migratedOptions.collaboration
      ? undefined
      : 'ydoc' in migratedOptions.collaboration
        ? migratedOptions.collaboration
        : createCollaboration(migratedOptions.collaboration)

  // Debug overlay: opt-in via `debug: true`. Lives and dies with the editor.
  const performanceMonitor = migratedOptions.debug
    ? createPerformanceMonitor()
    : undefined

  let tiptapEditor = createTiptapEditor(migratedOptions, plugins, collaborationSetup)
  let pluginActions = createActionMap(tiptapEditor, plugins)

  for (const plugin of plugins) {
    plugin.hooks?.onInit?.(tiptapEditor)
  }

  const rebuildEditor = () => {
    const currentJSON = tiptapEditor.getJSON()
    const selection = tiptapEditor.state.selection
    const target = migratedOptions.target

    tiptapEditor.destroy()
    tiptapEditor = createTiptapEditor(
      { ...migratedOptions, content: currentJSON },
      plugins,
      collaborationSetup,
    )

    try {
      const { from, to } = selection
      if (from >= 0 && to >= from && to <= tiptapEditor.state.doc.content.size) {
        tiptapEditor.commands.setTextSelection({ from, to })
      }
    } catch {
      // Ignore invalid selection after schema change.
    }

    if (target) {
      tiptapEditor.commands.focus()
    }

    pluginActions = createActionMap(tiptapEditor, plugins)
  }

  const editor: DocsEditor = {
    get editor() {
      return tiptapEditor
    },
    collab: collaborationSetup,
    getJSON: () => tiptapEditor.getJSON(),
    getHTML: () => tiptapEditor.getHTML(),
    destroy: () => {
      for (const plugin of plugins) {
        plugin.hooks?.onDestroy?.(tiptapEditor)
      }
      tiptapEditor.destroy()
      collaborationSetup?.destroy()
      performanceMonitor?.destroy()
    },
    use: (plugin) => {
      plugins.push(plugin)
      rebuildEditor()
      plugin.hooks?.onInit?.(tiptapEditor)
    },
    get pluginActions() {
      return pluginActions
    },
    performanceMonitor,
  }

  return editor
}

/**
 * Issue #305: StarterKit's inline code ships markdown input rules, so typing
 * `` `text` `` converted the sentence into a code mark while the user was still
 * writing — surprising in a word processor, and it also swallowed the backticks the
 * user wanted to keep. The mark itself stays (pasted HTML that contains `<code>` still
 * renders as inline code); only the rule that rewrites typed input is dropped.
 */
const InlineCode = Code.extend({
  addInputRules: () => [],
})

function createTiptapEditor(
  options: EditorOptions,
  plugins: DocsEditorPlugin[],
  collaborationSetup?: CollaborationSetup,
): TiptapEditor {
  // TipTap v3's StarterKit already bundles Link and Underline, and our docs plugins
  // register their own instances (`link.ts` configures openOnClick, `formatting.ts`
  // the underline mark). Keeping both copies makes v3 log
  // "Duplicate extension names found: ['link', 'underline']" and leaves two
  // competing instances in the schema, so the StarterKit copies are disabled here.
  // `undoRedo` is what v3 renamed `history` to: collaboration ships its own undo
  // manager, so StarterKit's must stay off.
  // v3's StarterKit also bundles a `trailingNode` that appends an empty paragraph
  // after any isolating block, so merely opening a document that ends with a table
  // mutates it on the first transaction (the trailing paragraph lands in the doc,
  // in exports, and in page geometry). docflow keeps v2 semantics: documents are
  // changed only by the user, so the trailing node stays off.
  const starterKitOptions = {
    link: false,
    underline: false,
    trailingNode: false,
    // Replaced by `InlineCode` below, which keeps the mark but not its input rules.
    code: false,
  } as const
  const baseStarterKit = options.collaboration
    ? StarterKit.configure({ ...starterKitOptions, undoRedo: false })
    : StarterKit.configure(starterKitOptions)
  const pluginExtensions = collectExtensions(plugins)

  const blockAttrs = options.getPageMap
    ? BlockAttributesExtension.configure({ pageMap: options.getPageMap })
    : BlockAttributesExtension

  const paginationExt = options.paginationOptions
    ? PaginationPlus.configure(options.paginationOptions)
    : PaginationPlus

  // ManualColumnResize MUST be registered BEFORE the table plugin, hence it
  // stays the first entry here: it uses native addEventListener to bypass
  // prosemirror-tables' handleDOMEvents block.
  let extensions: AnyExtension[] = [
    ManualColumnResize,
    baseStarterKit,
    // Inline code mark without the `` `x` `` input rule (#305).
    InlineCode,
    TextStyle,
    blockAttrs,
    paginationExt,
    // Always present — carries host-injected ports (onImageUpload, citation, …)
    // in storage so plugin commands can reach them through the editor instance.
    EditorContextExtension.configure({
      onImageUpload: options.onImageUpload,
      citation: options.citation,
      aiStream: options.aiStream,
      aiDraft: options.aiDraft,
    }),
    // Always present — find & replace decorations + state (core editing infra).
    SearchAndReplaceExtension,
    // Always present — Tab/Shift-Tab block indent (issue #189). Declares
    // priority 50 so list nesting, table cell navigation and the AI preview
    // keep their own Tab bindings.
    IndentExtension,
    // Backspace/Delete outdent (#189, second round) — registered separately because it
    // needs a priority above `baseKeymap`, unlike Tab.
    IndentBackspaceExtension,
    ...pluginExtensions,
  ]
  const content = options.collaboration ? undefined : options.content

  if (options.collaboration && collaborationSetup) {
    // Deliberately NO local seeding from `content` here: in collab mode the Yjs
    // document is authoritative, and an unguarded local seed races with other
    // clients and duplicates the document. Hosts seed via `initialStorageState`
    // or the server's guarded seed endpoint (Phase 1).
    extensions = [...extensions, ...collaborationExtensions(collaborationSetup)]
  }

  return new TiptapEditor({
    element: options.target,
    content,
    extensions,
    editable: options.editable ?? true,
    onUpdate: ({ editor }) => {
      options.onUpdate?.(editor.getJSON())
    },
    editorProps: {
      // Sanitize pasted HTML (strips <meta>, <style>, comments, etc.)
      // before ProseMirror parsing. Prevents crashes from non-content
      // tags commonly produced by Google Docs clipboard data.
      transformPastedHTML: sanitizePastedHTML,
    },
  })
}
