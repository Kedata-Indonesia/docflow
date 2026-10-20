import { computed } from 'vue'
import type { Editor } from '@tiptap/core'
import type { DocsEditorPlugin, ToolbarItem } from '@kedata-indonesia/docflow-core'
import {
  ALIGN_ACTIONS,
  COLOR_ACTIONS,
  HEADING_ACTIONS,
  INSERT_ACTIONS,
  LIST_ACTIONS,
} from '../components/toolbar/toolbarConfig.js'
import { runToolbarAction } from '../components/toolbar/toolbarCommands.js'

interface ToolbarGroup {
  pluginId: string
  items: ToolbarItem[]
}

/**
 * Derives the plugin-driven toolbar buckets once, so each control renders a
 * filtered list instead of re-scanning every plugin.
 */
export function useToolbarItems(
  getPlugins: () => DocsEditorPlugin[] | undefined,
  getActions: () => Record<string, (...args: unknown[]) => boolean>,
  getEditor: () => Editor | null,
  close: () => void,
) {
  const toolbarGroups = computed<ToolbarGroup[]>(() => {
    const groups: ToolbarGroup[] = []
    for (const plugin of getPlugins() ?? []) {
      if (!plugin.toolbar || plugin.toolbar.length === 0) continue
      groups.push({ pluginId: plugin.id, items: plugin.toolbar })
    }
    return groups
  })

  const allPluginItems = computed(() => toolbarGroups.value.flatMap((g) => g.items))
  const alignItems = computed(() => allPluginItems.value.filter((i) => ALIGN_ACTIONS.includes(i.action)))
  const listItems = computed(() => allPluginItems.value.filter((i) => LIST_ACTIONS.includes(i.action)))
  const insertItems = computed(() => allPluginItems.value.filter((i) => INSERT_ACTIONS.includes(i.action)))
  const colorItems = computed(() => allPluginItems.value.filter((i) => COLOR_ACTIONS.includes(i.action)))
  const textColorItem = computed(() => colorItems.value.find((i) => i.action === 'setTextColor'))
  const highlightItem = computed(() => colorItems.value.find((i) => i.action === 'setHighlight'))
  const flatItems = computed(() =>
    allPluginItems.value.filter(
      (i) =>
        !HEADING_ACTIONS.includes(i.action) &&
        !ALIGN_ACTIONS.includes(i.action) &&
        !LIST_ACTIONS.includes(i.action) &&
        !INSERT_ACTIONS.includes(i.action) &&
        !COLOR_ACTIONS.includes(i.action),
    ),
  )

  function runPluginItem(item: ToolbarItem) {
    runToolbarAction(getEditor(), getActions(), item.action, item.args ?? [])
  }

  function runFromDropdown(item: ToolbarItem) {
    runPluginItem(item)
    close()
  }

  return {
    toolbarGroups,
    alignItems,
    listItems,
    insertItems,
    colorItems,
    textColorItem,
    highlightItem,
    flatItems,
    runPluginItem,
    runFromDropdown,
  }
}
