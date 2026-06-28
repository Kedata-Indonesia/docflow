import { AnyExtension, Editor as TiptapEditor, getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
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
import { PaginationPlus, type PaginationPlusOptions } from 'tiptap-pagination-plus'

export interface EditorOptions {
  target?: HTMLElement
  content?: object | string
  plugins?: DocsEditorPlugin[]
  editable?: boolean
  onUpdate?: (json: object) => void
  collaboration?: CollaborationOptions
  getPageMap?: () => Map<number, { page: number; blockIndex: number }>
  paginationOptions?: PaginationPlusOptions
}

export interface DocsEditor {
  editor: TiptapEditor
  getJSON: () => object
  getHTML: () => string
  destroy: () => void
  use: (plugin: DocsEditorPlugin) => void
  pluginActions: Record<string, (...args: unknown[]) => boolean>
}

function migrateContent(content: any): any {
  if (!content) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify(migrateContent(parsed))
    } catch {
      return content
    }
  }
  if (typeof content !== 'object') return content

  if (content.type === 'doc' && Array.isArray(content.content)) {
    const newContentList: any[] = []
    for (const child of content.content) {
      if (child && child.type === 'page' && Array.isArray(child.content)) {
        newContentList.push(...child.content)
      } else {
        newContentList.push(child)
      }
    }
    return {
      ...content,
      content: newContentList,
    }
  }

  if (content.type === 'tabbed-doc' && Array.isArray(content.tabs)) {
    return {
      ...content,
      tabs: content.tabs.map((tab: any) => ({
        ...tab,
        content: migrateContent(tab.content)
      }))
    }
  }

  return content
}

export function createEditor(options: EditorOptions = {}): DocsEditor {
  const migratedOptions = {
    ...options,
    content: options.content ? migrateContent(options.content) : options.content
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
    blockAttrs,
    paginationExt,
    ...pluginExtensions,
  ]
  const content = options.collaboration ? undefined : options.content

  if (options.collaboration && collaborationSetup) {
    if (options.content && typeof options.content === 'object') {
      const schema = getSchema([baseStarterKit, blockAttrs, paginationExt, ...pluginExtensions])
      prosemirrorJSONToYXmlFragment(
        schema,
        options.content,
        collaborationSetup.ydoc.getXmlFragment('default'),
      )
    }

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
  })
}
