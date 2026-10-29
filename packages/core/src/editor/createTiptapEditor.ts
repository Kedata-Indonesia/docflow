import { AnyExtension, Editor as TiptapEditor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Code } from '@tiptap/extension-code'
import { CodeBlock } from '@tiptap/extension-code-block'
import { PaginationPlus } from 'tiptap-pagination-plus'
import { collectExtensions, type DocsEditorPlugin } from '../PluginSystem.js'
import { collaborationExtensions, type CollaborationSetup } from '../Collaboration.js'
import { BlockAttributesExtension } from '../BlockAttributes.js'
import { EditorContextExtension } from '../EditorContext.js'
import { IndentBackspaceExtension, IndentExtension } from '../Indent.js'
import { ManualColumnResize } from '../ManualColumnResize.js'
import { SearchAndReplaceExtension } from '../SearchAndReplace.js'
import { KeepTogetherExtension } from '../KeepTogether.js'
import { sanitizePastedHTML } from '../pasteNormalization.js'
import type { EditorOptions } from './editorTypes.js'

/**
 * Issue #305: StarterKit's inline code ships markdown input rules, so typing
 * `` `text` `` converted the sentence into a code mark while the user was still
 * writing — surprising in a word processor, and it also swallowed the backticks the
 * user wanted to keep. The mark itself stays (pasted HTML that contains `<code>` still
 * renders as inline code); only the rule that rewrites typed input is dropped.
 */
const InlineCode = Code.extend({
  addInputRules: () => [],
})

export function createTiptapEditor(
  options: EditorOptions,
  plugins: DocsEditorPlugin[],
  collaborationSetup?: CollaborationSetup,
): TiptapEditor {
  // TipTap v3's StarterKit already bundles Link and Underline, and our docs plugins
  // register their own instances (`link.ts` configures openOnClick, `formatting.ts`
  // the underline mark). Keeping both copies makes v3 log
  // "Duplicate extension names found: ['link', 'underline']" and leaves two
  // competing instances in the schema, so the StarterKit copies are disabled here.
  // `undoRedo` is what v3 renamed `history` to: collaboration ships its own undo
  // manager, so StarterKit's must stay off.
  // v3's StarterKit also bundles a `trailingNode` that appends an empty paragraph
  // after any isolating block, so merely opening a document that ends with a table
  // mutates it on the first transaction (the trailing paragraph lands in the doc,
  // in exports, and in page geometry). docflow keeps v2 semantics: documents are
  // changed only by the user, so the trailing node stays off.
  const starterKitOptions = {
    link: false,
    underline: false,
    trailingNode: false,
    // Replaced by `InlineCode` below, which keeps the mark but not its input rules.
    code: false,
    // Replaced by `CodeBlockLowlight` from the code-block plugin (language +
    // syntax highlighting, issue #247).
    codeBlock: false,
  } as const
  const baseStarterKit = options.collaboration
    ? StarterKit.configure({ ...starterKitOptions, undoRedo: false })
    : StarterKit.configure(starterKitOptions)
  const pluginExtensions = collectExtensions(plugins)
  // The code-block plugin supplies `CodeBlockLowlight`; without it, keep a
  // plain code block so custom plugin sets don't lose the node (issue #247).
  const hasCodeBlockPlugin = plugins.some((plugin) => plugin.id === 'code-block')

  const blockAttrs = options.getPageMap
    ? BlockAttributesExtension.configure({ pageMap: options.getPageMap })
    : BlockAttributesExtension

  const paginationExt = options.paginationOptions
    ? PaginationPlus.configure(options.paginationOptions)
    : PaginationPlus

  // ManualColumnResize MUST be registered BEFORE the table plugin, hence it
  // stays the first entry here: it uses native addEventListener to bypass
  // prosemirror-tables' handleDOMEvents block.
  let extensions: AnyExtension[] = [
    ManualColumnResize,
    baseStarterKit,
    ...(hasCodeBlockPlugin ? [] : [CodeBlock]),
    // Inline code mark without the `` `x` `` input rule (#305).
    InlineCode,
    TextStyle,
    blockAttrs,
    paginationExt,
    // Always present — carries host-injected ports (onImageUpload, citation, …)
    // in storage so plugin commands can reach them through the editor instance.
    EditorContextExtension.configure({
      onImageUpload: options.onImageUpload,
      citation: options.citation,
      aiStream: options.aiStream,
      aiDraft: options.aiDraft,
    }),
    // Always present — find & replace decorations + state (core editing infra).
    SearchAndReplaceExtension,
    // Always present — PaginationPlus keep-together for quote/code blocks (#249).
    KeepTogetherExtension.configure({
      types: options.keepTogetherTypes ?? ['blockquote', 'codeBlock'],
    }),
    // Always present — Tab/Shift-Tab block indent (issue #189). Declares
    // priority 50 so list nesting, table cell navigation and the AI preview
    // keep their own Tab bindings.
    IndentExtension,
    // Backspace/Delete outdent (#189, second round) — registered separately because it
    // needs a priority above `baseKeymap`, unlike Tab.
    IndentBackspaceExtension,
    ...pluginExtensions,
  ]
  const content = options.collaboration ? undefined : options.content

  if (options.collaboration && collaborationSetup) {
    // Deliberately NO local seeding from `content` here: in collab mode the Yjs
    // document is authoritative, and an unguarded local seed races with other
    // clients and duplicates the document. Hosts seed via `initialStorageState`
    // or the server's guarded seed endpoint (Phase 1).
    extensions = [...extensions, ...collaborationExtensions(collaborationSetup)]
  }

  return new TiptapEditor({
    element: options.target,
    content,
    extensions,
    editable: options.editable ?? true,
    onUpdate: ({ editor }) => {
      options.onUpdate?.(editor.getJSON())
    },
    editorProps: {
      // Sanitize pasted HTML (strips <meta>, <style>, comments, etc.)
      // before ProseMirror parsing. Prevents crashes from non-content
      // tags commonly produced by Google Docs clipboard data.
      transformPastedHTML: sanitizePastedHTML,
    },
  })
}
