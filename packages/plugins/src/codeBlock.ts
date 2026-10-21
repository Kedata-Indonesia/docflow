import { definePlugin } from '@kedata-indonesia/docflow-core'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

/**
 * Lowlight instance with the common language set (JavaScript/TypeScript,
 * Python, Go, Rust, Java, C/C++, SQL, Bash, JSON, YAML, HTML/XML, CSS, …).
 * Bundled offline — no host port, same as the math renderer.
 */
export const codeLowlight = createLowlight(common)

export const codeBlockPlugin = definePlugin({
  id: 'code-block',
  tiptapExtensions: [
    CodeBlockLowlight.configure({
      lowlight: codeLowlight,
      defaultLanguage: null,
    }),
  ],
  toolbar: [{ id: 'code-block', label: 'Code Block', action: 'toggleCodeBlock', iconComponent: 'Code' }],
  slashCommands: [{ name: 'Code Block', command: 'toggleCodeBlock' }],
})
