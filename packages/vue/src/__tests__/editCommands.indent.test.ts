import { defineComponent, h, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { DocsEditor } from '@kedata-indonesia/docflow-core'
import { useEditCommands } from '../composables/useEditCommands.js'

/**
 * Issue #189 / #197 item 3 — the Format ▸ Align & indent menu entries must
 * reach the editor. #191 wired the actions to a plugin name that was never
 * registered in `pluginActions`, so both items were silent no-ops.
 */

function mountCommands(commands: Record<string, unknown>) {
  const Harness = defineComponent({
    setup() {
      const editor = ref(null) as Ref<DocsEditor['editor'] | null>
      editor.value = { commands } as unknown as DocsEditor['editor']
      const { editFormatMenuCommands } = useEditCommands({
        editor,
        pluginActions: ref({}),
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
  return mount(Harness)
}

describe('Format ▸ indent menu actions (#189)', () => {
  it('dispatches indent/outdent to the editor commands', () => {
    const indent = vi.fn()
    const outdent = vi.fn()
    const focus = vi.fn()
    const wrapper = mountCommands({ indent, outdent, focus })

    const { editFormatMenuCommands } = wrapper.vm as unknown as {
      editFormatMenuCommands: Record<string, () => void>
    }

    editFormatMenuCommands.indent()
    editFormatMenuCommands.outdent()

    expect(indent).toHaveBeenCalledTimes(1)
    expect(outdent).toHaveBeenCalledTimes(1)
    // Both handlers restore focus to the editor after the command.
    expect(focus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
