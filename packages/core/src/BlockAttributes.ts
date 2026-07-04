import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface BlockAttributesOptions {
  pageMap?: () => Map<number, { page: number; blockIndex: number }>
}

export const BlockAttributesExtension = Extension.create<BlockAttributesOptions>({
  name: 'blockAttributes',

  addOptions() {
    return {
      pageMap: () => new Map(),
    }
  },

  addProseMirrorPlugins() {
    const getPageMap = this.options.pageMap!
    return [
      new Plugin({
        key: new PluginKey('blockAttributes'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const pageMap = getPageMap()
            if (pageMap.size === 0) return DecorationSet.create(state.doc, decorations)

            // Compute max blockIndex per page (to find last block of each page)
            const maxIdxPerPage = new Map<number, number>()
            pageMap.forEach(info => {
              const cur = maxIdxPerPage.get(info.page) ?? -1
              if (info.blockIndex > cur) maxIdxPerPage.set(info.page, info.blockIndex)
            })

            state.doc.descendants((node, pos) => {
              if (!node.isBlock) return
              const attrs: Record<string, string> = {
                'data-from': String(pos),
                'data-to': String(pos + node.nodeSize),
                'data-node-type': node.type.name,
              }
              const pageInfo = pageMap.get(pos)
              if (pageInfo) {
                attrs['data-page'] = String(pageInfo.page)
                attrs['data-page-block-index'] = String(pageInfo.blockIndex)
                const maxIdx = maxIdxPerPage.get(pageInfo.page)
                const styleParts: string[] = []
                if (pageInfo.page > 1 && pageInfo.blockIndex === 0) {
                  styleParts.push('margin-top:72px') // top padding pages 2+
                }
                if (maxIdx !== undefined && pageInfo.blockIndex === maxIdx) {
                  styleParts.push('margin-bottom:72px') // bottom padding per page
                }
                if (styleParts.length > 0) {
                  attrs.style = styleParts.join(';')
                }
              }
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, attrs),
              )
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
