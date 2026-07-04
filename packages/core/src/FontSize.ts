import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      /** Set font size on the current selection, e.g. '12px'. */
      setFontSize: (fontSize: string) => ReturnType
      /** Remove font size from the current selection. */
      unsetFontSize: () => ReturnType
    }
  }
}

/**
 * FontSizeExtension — adds a `fontSize` attribute onto TextStyle marks.
 * Requires TextStyle to be registered separately (done in Editor.ts).
 *
 * NOTE: commands use `commands.setMark` (low-level, same-transaction) instead of
 * `chain().setMark(...).run()` to avoid double-dispatch which causes text deletion.
 */
export const FontSizeExtension = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {}
              return { style: `font-size: ${attrs.fontSize}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      /**
       * Apply font-size to the selection by merging into an existing textStyle mark
       * (or creating a new one) — all within the SAME transaction.
       */
      setFontSize:
        (fontSize: string) =>
        ({ commands }) => {
          return commands.setMark('textStyle', { fontSize })
        },

      /**
       * Clear font-size from the selection by setting it to null.
       * TextStyle will auto-remove itself if all its attributes are null.
       */
      unsetFontSize:
        () =>
        ({ commands }) => {
          return commands.setMark('textStyle', { fontSize: null })
        },
    }
  },
})
