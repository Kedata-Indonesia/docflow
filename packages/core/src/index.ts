export { createEditor, type EditorOptions, type DocsEditor } from './Editor.js'
export { BlockAttributesExtension } from './BlockAttributes.js'
export { PaginationPlus, type PaginationPlusOptions, PAGE_SIZES, type PageSize } from 'tiptap-pagination-plus'
export {
  definePlugin,
  collectExtensions,
  resolveAction,
  createActionMap,
  type DocsEditorPlugin,
  type ToolbarItem,
  type SlashCommand,
} from './PluginSystem.js'
export {
  createCollaboration,
  collaborationExtensions,
  type CollaborationOptions,
  type CollaborationSetup,
  type AwarenessState,
} from './Collaboration.js'
