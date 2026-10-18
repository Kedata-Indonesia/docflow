import { definePlugin } from '@kedata-indonesia/docflow-core'
import { TaskItem, TaskList } from '@tiptap/extension-list'

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
