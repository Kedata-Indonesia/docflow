/**
 * Content migration for documents created by older docflow versions.
 *
 * Kept separate from the editor factory so the transform can be unit-tested
 * without instantiating TipTap.
 */

/**
 * Rename the legacy `bibliography` node (cited-only) to `referenceList` so old
 * documents keep their block under the new split (issue #252). The new
 * all-saved-sources bibliography carries `attrs.citationModel === 2` and is
 * left untouched.
 */
function migrateCitationBlocks(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(migrateCitationBlocks)
  if (typeof node !== 'object' || node === null) return node

  const obj = node as Record<string, unknown>
  const attrs = obj.attrs as Record<string, unknown> | undefined
  const isLegacyBibliography =
    obj.type === 'bibliography' && attrs?.citationModel !== 2
  const result: Record<string, unknown> = isLegacyBibliography
    ? { ...obj, type: 'referenceList' }
    : { ...obj }

  if (Array.isArray(result.content)) {
    result.content = result.content.map(migrateCitationBlocks)
  }
  if (Array.isArray(result.tabs)) {
    result.tabs = (result.tabs as unknown[]).map((tab) => {
      if (tab && typeof tab === 'object') {
        const tabObj = tab as Record<string, unknown>
        return {
          ...tabObj,
          content: migrateCitationBlocks(tabObj.content),
        }
      }
      return tab
    })
  }
  return result
}

export function migrateContent(content: unknown): unknown {
  if (!content) return content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown
      return JSON.stringify(migrateContent(parsed))
    } catch {
      return content
    }
  }
  if (typeof content !== 'object' || content === null) return content

  const obj = content as Record<string, unknown>
  let migrated: unknown = content

  if (obj.type === 'doc' && Array.isArray(obj.content)) {
    const newContentList: unknown[] = []
    for (const child of obj.content) {
      const childObj = child as Record<string, unknown> | null
      const isPage =
        childObj && childObj.type === 'page' && Array.isArray(childObj.content)
      if (isPage) {
        newContentList.push(...(childObj.content as unknown[]))
      } else {
        newContentList.push(child)
      }
    }
    migrated = { ...obj, content: newContentList }
  } else if (obj.type === 'tabbed-doc' && Array.isArray(obj.tabs)) {
    migrated = {
      ...obj,
      tabs: obj.tabs.map((tab) => {
        const tabObj = tab as Record<string, unknown>
        return { ...tabObj, content: migrateContent(tabObj.content) }
      }),
    }
  }

  return migrateCitationBlocks(migrated)
}
