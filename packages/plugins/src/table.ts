import { definePlugin } from '@kedata-indonesia/docflow-core'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'

export const tablePlugin = definePlugin({
  id: 'table',
  tiptapExtensions: [
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
  ],
  toolbar: [
    { id: 'insert-table', label: 'Insert Table', action: 'insertTable', args: [{ rows: 3, cols: 3, withHeaderRow: true }], iconComponent: 'Table' },
  ],
  slashCommands: [{ name: 'Table', command: 'insertTable' }],
})
