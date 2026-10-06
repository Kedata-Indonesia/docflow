import { AnyExtension, Editor as TiptapEditor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
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

function migrateContent(content: unknown): unknown {
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
    return { ...obj, content: newContentList }
  }

  if (obj.type === 'tabbed-doc' && Array.isArray(obj.tabs)) {
    return {
      ...obj,
      tabs: obj.tabs.map((tab) => ({
        ...(tab as Record<string, unknown>),
        content: migrateContent((tab as Record<string, unknown>).content),
      })),
    }
  }

  return content
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

function createTiptapEditor(
  options: EditorOptions,
  plugins: DocsEditorPlugin[],
  collaborationSetup?: CollaborationSetup,
): TiptapEditor {
  const baseStarterKit = options.collaboration
    ? StarterKit.configure({ history: false })
    : StarterKit
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
