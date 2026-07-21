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
import { SearchAndReplaceExtension } from './SearchAndReplace.js'
import type { ImageUploadHandler } from './ports.js'
import { PaginationPlus, type PaginationPlusOptions } from 'tiptap-pagination-plus'

/**
 * Sanitize pasted HTML content (e.g. from Google Docs) to prevent crashes
 * during ProseMirror parsing. Strips non-content tags like <meta>, <style>,
 * and HTML comments that are common in rich clipboard data but not valid
 * in the ProseMirror schema.
 *
 * Also converts Google Docs-specific markup into standard TipTap-compatible
 * HTML so that text color and background-color survive the paste.
 */
export function sanitizePastedHTML(html: string): string {
  // Strip <meta> tags (common in Google Docs clipboard HTML)
  let cleaned = html.replace(/<meta[^>]*>/gi, '')
  // Strip <style> tags and their content
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  // Strip HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')
  // Strip <link> tags (stylesheet links, etc.)
  cleaned = cleaned.replace(/<link[^>]*>/gi, '')
  // Strip <base> tags
  cleaned = cleaned.replace(/<base[^>]*>/gi, '')
  // Strip <title> tags and content
  cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')

  // ── Google Docs: wrap highlighted spans in <mark> while keeping color ────
  // The @tiptap/extension-highlight natively parses <mark> tags but NOT
  // <span> with inline background(-color). We wrap the content so highlight
  // survives paste.
  //   Case A (bg only):  <span style="background:#ff0;">hi</span>
  //     → <mark style="background:#ff0;">hi</mark>
  //   Case B (bg+color): <span style="background:#ff0;color:red;">hi</span>
  //     → <mark style="background:#ff0;"><span style="color:red;">hi</span></mark>
  //
  // Strategy: replace full <span…>…</span> elements (not nested) that have a
  // background style. This avoids the closing‑tag balancing nightmare.
  // Uses a simple non‑recursive approach: match spans that do NOT contain
  // another opening <span inside (i.e. leaf spans).
  {
    // Loop a few times to handle spans that are siblings (not nested)
    for (let pass = 0; pass < 10; pass++) {
      const before = cleaned
      cleaned = cleaned.replace(
        /<span\s([^>]*style\s*=\s*["'][^"']*(?:background-color|background)[^"']*["'][^>]*)>([^<]*(?:<(?!\/?span)[^>]*>[^<]*)*)<\/span>/gi,
        (_full: string, attrs: string, content: string) => {
          if (!/background(?:-color)?\s*:/.test(attrs)) return _full

          // Extract text color (not background-color) from style if present
          // Use negative lookbehind to avoid matching "background-color"
          const colorMatch = attrs.match(/(?<!background-)color\s*:\s*([^;"]+)/i)
          const colorVal = colorMatch ? colorMatch[1].trim() : null

          // Remove the text-color property from mark attributes (keep bg only)
          const markAttrs = colorVal
            ? attrs.replace(/(?<!background-)color\s*:\s*[^;"]+;?\s*/gi, '').trim()
            : attrs

          if (colorVal) {
            return `<mark ${markAttrs}><span style="color: ${colorVal};">${content}</span></mark>`
          }
          return `<mark ${markAttrs}>${content}</mark>`
        },
      )
      if (cleaned === before) break
    }
  }

  // ── Google Docs: <b style="font-weight:normal"> wrapper ──────────────────
  // Google Docs uses <b> as a generic wrapper (not bold) with
  // style="font-weight:normal". Strip the wrapping <b> so it doesn't
  // get parsed as an unwanted Bold mark.
  cleaned = cleaned.replace(
    /<b\s[^>]*style\s*=\s*["'][^"']*font-weight:\s*normal[^"']*["'][^>]*>/gi,
    '',
  )
  cleaned = cleaned.replace(/<\/b>/gi, '')

  // ── Google Docs: remove docs-internal-* id attributes ────────────────────
  cleaned = cleaned.replace(/\sid\s*=\s*["']docs-internal[^"']*["']/gi, '')

  return cleaned
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
  collaboration?: CollaborationOptions
  getPageMap?: () => Map<number, { page: number; blockIndex: number }>
  paginationOptions?: PaginationPlusOptions
  /** Host-injected image upload port (see docs/LIBRARY_CONTRACT.md). */
  onImageUpload?: ImageUploadHandler
}

export interface DocsEditor {
  editor: TiptapEditor
  collab?: CollaborationSetup
  getJSON: () => object
  getHTML: () => string
  destroy: () => void
  use: (plugin: DocsEditorPlugin) => void
  pluginActions: Record<string, (...args: unknown[]) => boolean>
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
  const collaborationSetup = migratedOptions.collaboration
    ? createCollaboration(migratedOptions.collaboration)
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
    },
    use: (plugin) => {
      plugins.push(plugin)
      rebuildEditor()
      plugin.hooks?.onInit?.(tiptapEditor)
    },
    get pluginActions() {
      return pluginActions
    },
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

  let extensions: AnyExtension[] = [
    baseStarterKit,
    TextStyle,
    blockAttrs,
    paginationExt,
    // Always present — carries host-injected ports (onImageUpload, …) in storage
    // so plugin commands can reach them through the editor instance.
    EditorContextExtension.configure({ onImageUpload: options.onImageUpload }),
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
