import { Extension } from '@tiptap/core'
import type { Mark, MarkType } from '@tiptap/pm/model'

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
 * Merge `fontSize` into an existing textStyle mark, or create a new one.
 * Preserves other textStyle attributes (e.g. color).
 */
function mergeFontSize(
  textStyleType: MarkType,
  existing: Mark | undefined,
  fontSize: string | null,
): Mark {
  if (fontSize === null) {
    // Remove fontSize, keep other attrs
    const { fontSize: _removed, ...rest } = existing?.attrs ?? ({} as Record<string, unknown>)
    return textStyleType.create(rest as Record<string, unknown>)
  }
  return textStyleType.create({ ...existing?.attrs, fontSize })
}

/** Check whether any non-null attrs remain */
function hasAttrs(mark: Mark): boolean {
  return Object.values(mark.attrs).some((v: unknown) => v != null)
}

/**
 * FontSizeExtension — adds a `fontSize` attribute onto TextStyle marks.
 * Requires TextStyle to be registered separately (done in Editor.ts).
 *
 * Uses direct transaction manipulation (tr.addMark / tr.addStoredMark) to:
 * 1. Avoid chaining conflicts when called from toolbar via chain().setFontSize()
 * 2. Properly merge font-size with existing textStyle attributes (color, etc.)
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
      setFontSize:
        (fontSize: string) =>
        ({ tr, state, dispatch }) => {
          console.log('[FontSizeExt] setFontSize called, fontSize:', fontSize, 'empty:', state.selection.empty)
          const textStyleType = state.schema.marks.textStyle
          const { from, to, empty } = state.selection

          if (empty) {
            // Cursor: merge into stored marks
            const stored: Mark[] = tr.storedMarks
              ? [...tr.storedMarks]
              : [...(state.storedMarks ?? [])]
            const idx = stored.findIndex((m: Mark) => m.type === textStyleType)
            const existing = idx >= 0 ? stored[idx] : undefined
            const merged = mergeFontSize(textStyleType, existing, fontSize)

            if (idx >= 0) {
              if (hasAttrs(merged)) {
                stored[idx] = merged
              } else {
                stored.splice(idx, 1)
              }
            } else {
              stored.push(merged)
            }
            tr.setStoredMarks(stored)
          } else {
            // Selection: merge into existing textStyle marks on each text node
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return
              const fromPos = Math.max(pos, from)
              const toPos = Math.min(pos + node.nodeSize, to)

              const existingTextStyle = node.marks.find(
                (m: Mark) => m.type === textStyleType,
              )
              const merged = mergeFontSize(textStyleType, existingTextStyle, fontSize)

              if (hasAttrs(merged)) {
                tr.addMark(fromPos, toPos, merged)
              } else if (existingTextStyle) {
                // No remaining attrs — remove the mark
                tr.removeMark(fromPos, toPos, existingTextStyle)
              }
            })
          }

          if (dispatch) dispatch(tr)
          return true
        },

      unsetFontSize:
        () =>
        ({ tr, state, dispatch }) => {
          const textStyleType = state.schema.marks.textStyle
          const { from, to, empty } = state.selection

          if (empty) {
            // Cursor: remove fontSize from stored marks
            const stored: Mark[] = tr.storedMarks
              ? [...tr.storedMarks]
              : [...(state.storedMarks ?? [])]
            const idx = stored.findIndex((m: Mark) => m.type === textStyleType)

            if (idx >= 0) {
              const merged = mergeFontSize(textStyleType, stored[idx], null)
              if (hasAttrs(merged)) {
                stored[idx] = merged
              } else {
                stored.splice(idx, 1)
              }
              tr.setStoredMarks(stored)
            }
          } else {
            // Selection: remove fontSize from existing textStyle marks
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return
              const fromPos = Math.max(pos, from)
              const toPos = Math.min(pos + node.nodeSize, to)

              const existingTextStyle = node.marks.find(
                (m: Mark) => m.type === textStyleType,
              )
              if (!existingTextStyle) return

              const merged = mergeFontSize(textStyleType, existingTextStyle, null)
              if (hasAttrs(merged)) {
                tr.addMark(fromPos, toPos, merged)
              } else {
                tr.removeMark(fromPos, toPos, existingTextStyle)
              }
            })
          }

          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})
