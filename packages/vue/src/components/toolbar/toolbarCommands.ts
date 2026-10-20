import type { Editor } from '@tiptap/core'
import type { ToolbarItem } from '@kedata-indonesia/docflow-core'

/**
 * Commands from extensions `docflow-vue` does not depend on directly (history,
 * paragraph, heading). TipTap augments `Commands` from those packages, but the
 * declaration build resolves `docflow-*` to `dist` (`tsconfig.build.json`
 * clears `paths`), so those augmentations are not part of this program. Type
 * the slice used here instead of `any`.
 */
export interface ToolbarOnlyCommands {
  undo: () => boolean
  redo: () => boolean
  setParagraph: () => boolean
  toggleHeading: (attributes: { level: 1 | 2 | 3 | 4 | 5 | 6 }) => boolean
}

export function toolbarCommands(editor: Editor): ToolbarOnlyCommands {
  return editor.commands as unknown as ToolbarOnlyCommands
}

/**
 * Actions win over built-in editor commands, matching the public plugin
 * contract: a host can override any toolbar action through `pluginActions`.
 */
export function runToolbarAction(
  editor: Editor | null,
  actions: Record<string, (...args: unknown[]) => boolean>,
  action: string,
  args: unknown[] = [],
): boolean {
  if (!editor) return false

  const fn = actions[action]
  if (typeof fn === 'function') {
    fn(...args)
    editor.commands.focus()
    return true
  }

  const command = (editor.commands as Record<string, (...args: unknown[]) => boolean>)[action]
  if (typeof command === 'function') {
    command(...args)
    editor.commands.focus()
    return true
  }

  return false
}

export function isToolbarItemActive(editor: Editor | null, item: ToolbarItem): boolean {
  if (!editor) return false

  switch (item.action) {
    case 'toggleBold':
      return editor.isActive('bold')
    case 'toggleItalic':
      return editor.isActive('italic')
    case 'toggleUnderline':
      return editor.isActive('underline')
    case 'toggleStrike':
      return editor.isActive('strike')
    case 'toggleHeading1':
      return editor.isActive('heading', { level: 1 })
    case 'toggleHeading2':
      return editor.isActive('heading', { level: 2 })
    case 'toggleHeading3':
      return editor.isActive('heading', { level: 3 })
    case 'toggleHeading4':
      return editor.isActive('heading', { level: 4 })
    case 'toggleHeading5':
      return editor.isActive('heading', { level: 5 })
    case 'toggleHeading6':
      return editor.isActive('heading', { level: 6 })
    case 'toggleBulletList':
      return editor.isActive('bulletList')
    case 'toggleOrderedList':
      return editor.isActive('orderedList')
    case 'toggleTaskList':
      return editor.isActive('taskList')
    case 'toggleBlockquote':
      return editor.isActive('blockquote')
    case 'toggleCodeBlock':
      return editor.isActive('codeBlock')
    case 'setLink':
      return editor.isActive('link')
    case 'alignLeft':
      return editor.isActive({ textAlign: 'left' })
    case 'alignCenter':
      return editor.isActive({ textAlign: 'center' })
    case 'alignRight':
      return editor.isActive({ textAlign: 'right' })
    case 'alignJustify':
      return editor.isActive({ textAlign: 'justify' })
    default:
      return false
  }
}
