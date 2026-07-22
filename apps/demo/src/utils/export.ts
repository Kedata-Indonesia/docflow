// Re-export the shared export engine from the library package.
// The demo is a backend-free showcase host; it uses the same ProseMirror → file mappers.
export { exportDocument } from '@kedata-indonesia/docflow-export'
export type { ExportFormat, EditorLike } from '@kedata-indonesia/docflow-export'
