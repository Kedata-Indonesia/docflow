import { Extension } from '@tiptap/core'
import type { Mark, MarkType } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      /** Set font family on the current selection, e.g. 'Georgia, serif'. */
      setFontFamily: (fontFamily: string) => ReturnType
      /** Remove font family from the current selection. */
      unsetFontFamily: () => ReturnType
    }
  }
}

/**
 * Merge `fontFamily` into an existing textStyle mark, or create a new one.
 * Preserves other textStyle attributes (fontSize, color, …).
 */
function mergeFontFamily(
  textStyleType: MarkType,
  existing: Mark | undefined,
  fontFamily: string | null,
): Mark {
  if (fontFamily === null) {
    const { fontFamily: _removed, ...rest } = existing?.attrs ?? ({} as Record<string, unknown>)
    return textStyleType.create(rest as Record<string, unknown>)
  }
  return textStyleType.create({ ...existing?.attrs, fontFamily })
}

/** Check whether any non-null attrs remain */
function hasAttrs(mark: Mark): boolean {
  return Object.values(mark.attrs).some((v: unknown) => v != null)
}

/**
 * FontFamilyExtension — adds a `fontFamily` attribute onto TextStyle marks.
 * Requires TextStyle to be registered separately (done in Editor.ts).
 *
 * Mirrors FontSizeExtension: it manipulates the transaction directly
 * (tr.setStoredMarks for a collapsed caret / tr.addMark over a selection) so it
 * merges cleanly with the other TextStyle attributes (fontSize, color) instead
 * of clobbering them. The attribute round-trips through HTML, so the chosen
 * font is stored with the document.
 */
export const FontFamilyExtension = Extension.create({
  name: 'fontFamily',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontFamily || null,
            renderHTML: (attrs) => {
              if (!attrs.fontFamily) return {}
              return { style: `font-family: ${attrs.fontFamily}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontFamily:
        (fontFamily: string) =>
        ({ tr, state, dispatch }) => {
          const textStyleType = state.schema.marks.textStyle
          const { from, to, empty } = state.selection

          if (empty) {
            // Cursor: merge into stored marks.
            const stored: Mark[] = tr.storedMarks
              ? [...tr.storedMarks]
              : [...(state.storedMarks ?? [])]
            const idx = stored.findIndex((m: Mark) => m.type === textStyleType)
            const existing = idx >= 0 ? stored[idx] : undefined
            const merged = mergeFontFamily(textStyleType, existing, fontFamily)

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
            // Selection: merge into each covered text node.
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return
              const fromPos = Math.max(pos, from)
              const toPos = Math.min(pos + node.nodeSize, to)

              const existingTextStyle = node.marks.find((m: Mark) => m.type === textStyleType)
              const merged = mergeFontFamily(textStyleType, existingTextStyle, fontFamily)

              if (hasAttrs(merged)) {
                tr.addMark(fromPos, toPos, merged)
              } else if (existingTextStyle) {
                tr.removeMark(fromPos, toPos, existingTextStyle)
              }
            })
          }

          if (dispatch) dispatch(tr)
          return true
        },

      unsetFontFamily:
        () =>
        ({ tr, state, dispatch }) => {
          const textStyleType = state.schema.marks.textStyle
          const { from, to, empty } = state.selection

          if (empty) {
            const stored: Mark[] = tr.storedMarks
              ? [...tr.storedMarks]
              : [...(state.storedMarks ?? [])]
            const idx = stored.findIndex((m: Mark) => m.type === textStyleType)

            if (idx >= 0) {
              const merged = mergeFontFamily(textStyleType, stored[idx], null)
              if (hasAttrs(merged)) {
                stored[idx] = merged
              } else {
                stored.splice(idx, 1)
              }
              tr.setStoredMarks(stored)
            }
          } else {
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText) return
              const fromPos = Math.max(pos, from)
              const toPos = Math.min(pos + node.nodeSize, to)

              const existingTextStyle = node.marks.find((m: Mark) => m.type === textStyleType)
              if (!existingTextStyle) return

              const merged = mergeFontFamily(textStyleType, existingTextStyle, null)
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
