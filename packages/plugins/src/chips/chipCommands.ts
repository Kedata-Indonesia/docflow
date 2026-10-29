import type { Editor } from '@tiptap/core'
import { DEFAULT_STATUSES, slugify, todayISO } from './chipShared.js'

/**
 * v1 insert flow uses the same `window.prompt` fallback as the link extension;
 * a host can later inject a picker port (docs/reference/LIBRARY_CONTRACT.md §4)
 * without changing the node schema.
 */
function promptFor(message: string): string {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return ''
  return window.prompt(message, '') ?? ''
}

export const chipSlashCommands = [
  { name: 'Date', command: 'insertDateChip' },
  { name: 'People', command: 'insertPeopleChip' },
  { name: 'File', command: 'insertFileChip' },
  { name: 'Dropdown', command: 'insertDropdownChip' },
  { name: 'Location', command: 'insertLocationChip' },
]

export const chipCommands = {
  insertDateChip: (editor: Editor) => {
    return editor.chain().focus().insertContent({
      type: 'dateChip',
      attrs: { date: todayISO() },
    }).run()
  },
  insertPeopleChip: (editor: Editor) => {
    const name = promptFor('Enter user name:')
    if (!name.trim()) return false
    const trimmed = name.trim()
    return editor.chain().focus().insertContent({
      type: 'peopleChip',
      attrs: { userId: slugify(trimmed), name: trimmed },
    }).run()
  },
  insertFileChip: (editor: Editor) => {
    const name = promptFor('Enter file/document name:')
    if (!name.trim()) return false
    const trimmed = name.trim()
    return editor.chain().focus().insertContent({
      type: 'fileChip',
      attrs: { fileId: slugify(trimmed), name: trimmed },
    }).run()
  },
  insertDropdownChip: (editor: Editor) => {
    return editor.chain().focus().insertContent({
      type: 'dropdownChip',
      attrs: { options: DEFAULT_STATUSES, selected: DEFAULT_STATUSES[0] },
    }).run()
  },
  insertLocationChip: (editor: Editor) => {
    const label = promptFor('Enter location name:')
    if (!label.trim()) return false
    return editor.chain().focus().insertContent({
      type: 'locationChip',
      attrs: { label: label.trim() },
    }).run()
  },
}
