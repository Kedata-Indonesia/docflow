import { Markdown } from 'tiptap-markdown'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import { AIExtension } from './ai/extension.js'

/**
 * AI writing assistance (Phase 7B inline transforms + 7C generation at cursor).
 *
 * This module is the plugin manifest; the implementation is split so each piece
 * stays small and reviewable:
 *
 *  - `ai/extension.ts`  — `AIExtension`: storage, the five commands, lifecycle.
 *  - `ai/plugin.ts`     — the ProseMirror plugin (decorations, accept/reject keys).
 *  - `ai/pluginState.ts`— `aiPluginKey` + the preview reducer.
 *  - `ai/widgets.ts`    — the /ai prompt input and the ghost preview widgets.
 *  - `ai/stream.ts`     — transport port lookup, bounded context, stream loop.
 *  - `ai/types.ts`      — `AIPreviewState`, `AIMeta`, `AIStorage`, `AIMode`.
 *
 * The two non-negotiables from the phase-7 design:
 *
 *  1. Streaming NEVER mutates the document. Tokens accumulate in plugin state
 *     and render as decorations (highlight + ghost preview). Meta-only
 *     transactions carry no steps, so a collaborative Yjs doc sees zero churn
 *     while a preview streams.
 *  2. Accept is ONE ProseMirror transaction replacing the selection range
 *     (transform) or inserting at the cursor (generate), so y-prosemirror
 *     propagates it exactly like a human edit.
 *
 * The library never names a URL: the host injects `aiStream` through the
 * editorContext port (mirroring onImageUpload). Without it, actions are inert.
 */

export { AIExtension } from './ai/extension.js'
export { aiPluginKey } from './ai/pluginState.js'
export { getAIPreview } from './ai/stream.js'
export type { AIMode, AIPreviewState, AIStorage } from './ai/types.js'

export const aiPlugin = definePlugin({
  id: 'ai',
  // The `tiptap-markdown` `Markdown` extension is registered alongside AI so
  // that `editor.storage.markdown.parser` is available on every editor that
  // can stream AI content. It adds a schema-aware markdown↔HTML bridge
  // (markdown-it under the hood) used by the AI Insert/accept paths to turn
  // streamed `| col | col |` tables / `# headings` / `**bold**` into real
  // nodes instead of literal pipe/asterisk text. Its `insertContentAt` /
  // `setContent` command overrides are intentionally NOT used by the AI
  // paths (they force `inline:true`); see `markdownInsert.ts`.
  tiptapExtensions: [AIExtension, Markdown.configure({ html: true, linkify: true, breaks: false })],
  slashCommands: [{ name: 'AI', description: 'Generate text with AI', command: 'aiGenerate' }],
})
