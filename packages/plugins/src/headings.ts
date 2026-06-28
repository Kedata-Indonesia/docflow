import { definePlugin } from '@docs-editor/core'
import type { Editor } from '@tiptap/core'

type Level = 1 | 2 | 3 | 4 | 5 | 6

function toggleHeading(level: Level) {
  return (editor: Editor) => {
    const commands = editor.commands as Record<string, (...args: unknown[]) => boolean>
    return commands.toggleHeading({ level })
  }
}

export const headingsPlugin = definePlugin({
  id: 'headings',
  toolbar: [
    { id: 'heading-1', label: 'Heading 1', action: 'toggleHeading1', iconComponent: 'Heading1' },
    { id: 'heading-2', label: 'Heading 2', action: 'toggleHeading2', iconComponent: 'Heading2' },
    { id: 'heading-3', label: 'Heading 3', action: 'toggleHeading3', iconComponent: 'Heading3' },
    { id: 'heading-4', label: 'Heading 4', action: 'toggleHeading4', iconComponent: 'Heading4' },
    { id: 'heading-5', label: 'Heading 5', action: 'toggleHeading5', iconComponent: 'Heading5' },
    { id: 'heading-6', label: 'Heading 6', action: 'toggleHeading6', iconComponent: 'Heading6' },
  ],
  slashCommands: [
    { name: 'Heading 1', command: 'toggleHeading1' },
    { name: 'Heading 2', command: 'toggleHeading2' },
    { name: 'Heading 3', command: 'toggleHeading3' },
  ],
  commands: {
    toggleHeading1: toggleHeading(1),
    toggleHeading2: toggleHeading(2),
    toggleHeading3: toggleHeading(3),
    toggleHeading4: toggleHeading(4),
    toggleHeading5: toggleHeading(5),
    toggleHeading6: toggleHeading(6),
  },
})
