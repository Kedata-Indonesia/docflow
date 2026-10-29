import type { Editor as TiptapEditor } from '@tiptap/core'
import type { PaginationPlusOptions } from 'tiptap-pagination-plus'
import type { DocsEditorPlugin } from '../PluginSystem.js'
import type { CollaborationOptions, CollaborationSetup } from '../Collaboration.js'
import type { ImageUploadHandler, CitationPort } from '../ports.js'
import type { AIStreamFn, AIDraftFn } from '../ai/types.js'
import type { PerformanceMonitor } from '../PerformanceMonitor.js'

export interface EditorOptions {
  target?: HTMLElement
  content?: object | string
  plugins?: DocsEditorPlugin[]
  editable?: boolean
  onUpdate?: (json: object) => void
  /**
   * Collaboration config. Pass `CollaborationOptions` and the editor creates
   * (and owns) the setup; pass an existing `CollaborationSetup` and the editor
   * TAKES OWNERSHIP of it — `editor.destroy()` calls its `destroy()`. Reuse a
   * setup across mounts only if the host can recreate it.
   */
  collaboration?: CollaborationOptions | CollaborationSetup
  getPageMap?: () => Map<number, { page: number; blockIndex: number }>
  paginationOptions?: Partial<PaginationPlusOptions>
  /**
   * Node types kept on one page when they fit (issue #249). Applies to the
   * PaginationPlus mode; virtual pages already use the layout-engine's
   * `keepTogetherTypes`. Pass `[]` to opt out.
   */
  keepTogetherTypes?: string[]
  /** Host-injected image upload port (see docs/reference/LIBRARY_CONTRACT.md). */
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
