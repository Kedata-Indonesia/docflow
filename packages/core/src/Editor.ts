import { createActionMap } from './PluginSystem.js'
import { createCollaboration, type CollaborationSetup } from './Collaboration.js'
import { createPerformanceMonitor } from './PerformanceMonitor.js'
import { createTiptapEditor } from './editor/createTiptapEditor.js'
import { migrateContent } from './editor/migrateContent.js'
import type { DocsEditor, EditorOptions } from './editor/editorTypes.js'

/**
 * Pasted-HTML normalization lives in ./pasteNormalization.js (DOM-based
 * pipeline, Stage 2 — see docs/plans/clipboard-paste-pipeline-plan.md).
 * sanitizePastedHTML is kept as the backward-compatible export name.
 */
export {
  normalizeClipboardHTML,
  sanitizePastedHTML,
  detectClipboardSource,
  type ClipboardSource,
} from './pasteNormalization.js'

export type { DocsEditor, EditorOptions } from './editor/editorTypes.js'
export { migrateContent } from './editor/migrateContent.js'

// FontSizeExtension is no longer hardcoded here — it is registered
// by fontSizePlugin (packages/plugins/src/fontSize.ts) to avoid
// duplicate extension name collisions caused by Vite modualiasi.

export function createEditor(options: EditorOptions = {}): DocsEditor {
  const migratedOptions = {
    ...options,
    content: options.content
      ? (migrateContent(options.content) as string | object | undefined)
      : options.content,
  }
  const plugins = migratedOptions.plugins ?? []
  const collaborationSetup: CollaborationSetup | undefined = !migratedOptions.collaboration
    ? undefined
    : 'ydoc' in migratedOptions.collaboration
      ? migratedOptions.collaboration
      : createCollaboration(migratedOptions.collaboration)

  // Debug overlay: opt-in via `debug: true`. Lives and dies with the editor.
  const performanceMonitor = migratedOptions.debug ? createPerformanceMonitor() : undefined

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
