import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DocsEditor, DocumentMode } from '@kedata-indonesia/docflow-core'
import { useDocsEditorMenu } from '../composables/useDocsEditorMenu.js'
import { useEditCommands, EDIT_FORMAT_MENU_ACTIONS } from '../composables/useEditCommands.js'
import { ALL_MENU_ACTIONS } from '../components/menuStructure.js'
import { isHeaderBarLocalAction } from '../components/headerBarActions.js'
import { HOST_OWNED_ACTIONS, LIBRARY_MENU_ACTIONS } from '../components/menuActions.js'
import type { SidebarKey } from '../types.js'

/**
 * Issue #153 — the drift guard.
 *
 * `HOST_OWNED_ACTIONS` is derived from three *real dispatchers*: the
 * library-owned command map in `useDocsEditorMenu.ts`, the Edit/Format command
 * map in `useEditCommands.ts` and the header-bar action table
 * (`headerBarActions.ts`). The explicit mirrors of the first two
 * (`LIBRARY_MENU_ACTIONS`, `EDIT_FORMAT_MENU_ACTIONS`) are compared here against
 * the maps built with stub inputs, so adding an action to a dispatcher without
 * classifying it — or wiring a menu item and forgetting the list — fails.
 */

const sorted = (values: readonly string[]): string[] => [...values].sort()

/** No editor is needed to build either command map — a null-typed ref suffices. */
const noEditor = (): Ref<DocsEditor['editor'] | null> => ref(null) as Ref<DocsEditor['editor'] | null>

/** The library-owned command map, built with stub inputs (no editor needed). */
function buildMenuCommands(): Record<string, () => void> {
  return useDocsEditorMenu({
    editor: noEditor(),
    focusMode: ref(false),
    showFindReplace: ref(false),
    editFormatMenuCommands: {},
    isPageless: ref(false),
    showRuler: ref(true),
    activeSidebar: ref<SidebarKey | null>(null),
    getUpdateFootnotes: () => {},
    openPageSetupModal: () => {},
    handlePrint: () => {},
    toggleSidebar: () => {},
    startInlineHeaderEdit: () => {},
    startInlineFooterEdit: () => {},
    openLinkDialog: () => {},
    applyPageless: () => {},
    documentMode: ref<DocumentMode>('editing'),
    onDocumentMode: () => {},
    showDetailsModal: ref(false),
    showEmailModal: ref(false),
    onShare: () => {},
    onMenuClick: () => {},
  }).menuCommands
}

/** `useEditCommands` registers document listeners, so it needs a component. */
const EditCommandsHarness = defineComponent({
  setup() {
    const { editFormatMenuCommands } = useEditCommands({
      editor: noEditor(),
      pluginActions: ref<DocsEditor['pluginActions']>({}),
      focusMode: ref(false),
      showFindReplace: ref(false),
      userHeaderRight: ref(''),
      userFooterRight: ref(''),
      applyHeaderFooter: () => {},
      persistCurrentDoc: () => {},
    })
    return { editFormatMenuCommands }
  },
  render: () => h('div'),
})

function buildEditFormatCommands(): Record<string, () => void> {
  const harness = mount(EditCommandsHarness)
  const commands = (harness.vm as unknown as {
    editFormatMenuCommands: Record<string, () => void>
  }).editFormatMenuCommands
  harness.unmount()
  return commands
}

/**
 * Every host-owned action, spelled out on purpose: this is the *conscious
 * classification* step. A new menu item lands in `HOST_OWNED_ACTIONS`
 * automatically (it is derived), so without this snapshot an unwired item would
 * silently become "host-owned" and the guard would be worthless. Update this
 * list — and `HOST_OWNED_ACTIONS`'s doc comment if the category changes — when
 * adding a menu entry.
 */
const EXPECTED_HOST_OWNED: readonly string[] = [
  // File — only the host can create/open/duplicate/share/export/move/trash.
  'new-doc',
  'new-from-template',
  'open-doc',
  'duplicate',
  'share',
  'export:docx',
  'export:pdf',
  'export:odt',
  'export:txt',
  'export:rtf',
  'export:html-zip',
  'export:html',
  'export:markdown',
  'rename',
  'move',
  'add-to-starred',
  'trash',
  // Insert — host-provided templates.
  'meeting-notes',
  'email-draft',
  // Tools / Extensions / Help — host surface, not editor commands.
  'spellcheck',
  'word-count',
  'preferences',
  'manage-extensions',
  'keyboard-shortcuts',
  'report-issue',
  'about',
]

describe('menu action classification (#153)', () => {
  it('LIBRARY_MENU_ACTIONS mirrors the real library command map', () => {
    expect(sorted(Object.keys(buildMenuCommands()))).toEqual(sorted(LIBRARY_MENU_ACTIONS))
  })

  it('EDIT_FORMAT_MENU_ACTIONS mirrors the real Edit/Format command map', () => {
    expect(sorted(Object.keys(buildEditFormatCommands()))).toEqual(sorted(EDIT_FORMAT_MENU_ACTIONS))
  })

  it('classifies every action in the menu tree exactly once', () => {
    // No duplicate action ids in the tree (a duplicate would hide a wiring bug).
    expect(new Set(ALL_MENU_ACTIONS).size).toBe(ALL_MENU_ACTIONS.length)

    const unclassified = ALL_MENU_ACTIONS.filter(
      (action) =>
        !LIBRARY_MENU_ACTIONS.includes(action) &&
        !EDIT_FORMAT_MENU_ACTIONS.includes(action) &&
        !isHeaderBarLocalAction(action) &&
        !HOST_OWNED_ACTIONS.includes(action),
    )
    expect(unclassified).toEqual([])

    // The four buckets are disjoint — an action belongs to exactly one.
    const hostOwned = HOST_OWNED_ACTIONS.filter(
      (action) =>
        LIBRARY_MENU_ACTIONS.includes(action) ||
        EDIT_FORMAT_MENU_ACTIONS.includes(action) ||
        isHeaderBarLocalAction(action),
    )
    expect(hostOwned).toEqual([])
  })

  it('keeps HOST_OWNED_ACTIONS to the consciously classified set', () => {
    expect(sorted(HOST_OWNED_ACTIONS)).toEqual(sorted(EXPECTED_HOST_OWNED))
  })

  it('flags exports and host-only actions, never library commands', () => {
    for (const action of ['export:docx', 'share', 'move', 'trash', 'open-doc', 'duplicate']) {
      expect(HOST_OWNED_ACTIONS).toContain(action)
    }
    for (const action of ['bold', 'print', 'page-setup', 'insert-table', 'mode-editing']) {
      expect(HOST_OWNED_ACTIONS).not.toContain(action)
    }
  })
})
