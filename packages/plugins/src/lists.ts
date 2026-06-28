import { definePlugin } from '@docs-editor/core'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

export const listsPlugin = definePlugin({
  id: 'lists',
  tiptapExtensions: [TaskList, TaskItem.configure({ nested: true })],
  toolbar: [
    { id: 'bullet-list', label: 'Bullet List', action: 'toggleBulletList', iconComponent: 'List' },
    { id: 'ordered-list', label: 'Ordered List', action: 'toggleOrderedList', iconComponent: 'ListOrdered' },
    { id: 'task-list', label: 'Task List', action: 'toggleTaskList', iconComponent: 'CheckSquare' },
  ],
  slashCommands: [
    { name: 'Bullet List', command: 'toggleBulletList' },
    { name: 'Ordered List', command: 'toggleOrderedList' },
    { name: 'Task List', command: 'toggleTaskList' },
  ],
})
