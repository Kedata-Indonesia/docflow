import type { AnyExtension, Editor as TiptapEditor } from '@tiptap/core'

export interface ToolbarItem {
  id: string
  icon?: string
  iconComponent?: string
  label?: string
  action: string
  args?: unknown[]
  /**
   * Group this item into the toolbar's compact groups instead of rendering it
   * as a flat button. Currently only `'insert'` (the "+" / Sisipkan dropdown)
   * is supported; built-in insert actions (link, image, table, footnote, page
   * break, …) are grouped automatically, so plugins only need this flag for
   * their OWN actions.
   *
   * Defaults to `undefined` → flat toolbar button (previous behaviour).
   */
  menu?: 'insert'
}

export interface SlashCommand {
  name: string
  description?: string
  command: string
}

export interface DocsEditorPlugin {
  id: string
  tiptapExtensions?: AnyExtension[]
  toolbar?: ToolbarItem[]
  slashCommands?: SlashCommand[]
  commands?: Record<string, (editor: TiptapEditor, ...args: unknown[]) => boolean>
  hooks?: {
    onInit?: (editor: TiptapEditor) => void
    onDestroy?: (editor: TiptapEditor) => void
  }
}

export function definePlugin(plugin: DocsEditorPlugin): DocsEditorPlugin {
  return plugin
}

export function collectExtensions(plugins: DocsEditorPlugin[]): AnyExtension[] {
  const extensions: AnyExtension[] = []
  for (const plugin of plugins) {
    if (plugin.tiptapExtensions) {
      extensions.push(...plugin.tiptapExtensions)
    }
  }
  return extensions
}

export function resolveAction(
  editor: TiptapEditor,
  action: string,
  ...args: unknown[]
): boolean {
  const commands = editor.commands as Record<string, (...args: unknown[]) => boolean | undefined>
  const command = commands[action]
  if (typeof command !== 'function') {
    return false
  }
  const result = command(...args)
  return result === true
}

export function createActionMap(
  editor: TiptapEditor,
  plugins: DocsEditorPlugin[],
): Record<string, (...args: unknown[]) => boolean> {
  const map: Record<string, (...args: unknown[]) => boolean> = {}
  for (const plugin of plugins) {
    for (const item of plugin.toolbar ?? []) {
      const custom = plugin.commands?.[item.action]
      map[item.action] = (...args: unknown[]) => {
        if (typeof custom === 'function') {
          return custom(editor, ...args)
        }
        return resolveAction(editor, item.action, ...args)
      }
    }
    for (const slash of plugin.slashCommands ?? []) {
      const custom = plugin.commands?.[slash.command]
      map[slash.command] = (...args: unknown[]) => {
        if (typeof custom === 'function') {
          return custom(editor, ...args)
        }
        return resolveAction(editor, slash.command, ...args)
      }
    }
  }
  return map
}
