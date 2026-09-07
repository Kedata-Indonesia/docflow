import { describe, it, expect } from 'vitest'
import { NodeSelection } from '@tiptap/pm/state'
import { createEditor, createCollaboration } from '@kedata-indonesia/docflow-core'
import { imagePlugin, defaultPlugins } from '../index.js'

/**
 * Issue #115 regression: "Gambar yang Disisipkan Tidak Dapat Dihapus Saat
 * Sesi Kolaborasi Multi-User Aktif" — inserted images cannot be deleted
 * during active multi-user collaboration.
 *
 * Root cause (now fixed): the webrtc-without-signaling collab provider
 * silently failed to sync Yjs edits between peers (PR #173 switched to
 * websocket). Combined with a dual-yjs instantiation (server CJS
 * y-websocket vs. client ESM yjs via the core barrel), deletion
 * transactions either didn't propagate or were encoded with an
 * incompatible yjs instance. The fix: websocket provider in dev +
 * single yjs instance (the ./ai subpath split keeps the server from
 * pulling the client collab stack).
 *
 * These tests pin the fix: image nodes CAN be deleted via both
 * Delete and Backspace keys, in both non-collab and collab modes,
 * with both imagePlugin-only and full defaultPlugins schemas.
 */
describe('issue #115: image delete in collab mode', () => {
  it.each(['Delete', 'Backspace'])(
    'non-collab: deletes a selected image with %s',
    (key) => {
      const target = document.createElement('div')
      document.body.appendChild(target)
      const inst = createEditor({ target, plugins: [imagePlugin] })
      try {
        inst.editor.commands.setImage({ src: 'https://example.com/x.png' })
        inst.editor.commands.setNodeSelection(0)
        expect(inst.editor.state.selection).toBeInstanceOf(NodeSelection)

        inst.editor.view.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        )

        const hasImage = inst.editor
          .getJSON()
          .content?.some((c) => c.type === 'image')
        expect(hasImage).toBe(false)
      } finally {
        inst.destroy()
        target.remove()
      }
    },
  )

  it.each(['Delete', 'Backspace'])(
    'collab [imagePlugin]: deletes a selected image with %s',
    async (key) => {
      const target = document.createElement('div')
      document.body.appendChild(target)
      // Issue fe-aktifai#230: createEditor accepts a prebuilt CollaborationSetup
      // only — raw options are built via the async createCollaboration.
      const collabSetup = await createCollaboration({
        room: `issue-115-img-${key}`,
        user: { name: 'Alice', color: '#f00' },
      })
      const inst = createEditor({
        target,
        plugins: [imagePlugin],
        collaboration: collabSetup,
      })
      try {
        inst.editor.commands.setImage({ src: 'https://example.com/x.png' })
        inst.editor.commands.setNodeSelection(0)
        expect(inst.editor.state.selection).toBeInstanceOf(NodeSelection)

        inst.editor.view.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        )

        const hasImage = inst.editor
          .getJSON()
          .content?.some((c) => c.type === 'image')
        expect(hasImage).toBe(false)
      } finally {
        inst.destroy()
        target.remove()
      }
    },
  )

  it.each(['Delete', 'Backspace'])(
    'collab [defaultPlugins]: deletes a selected image with %s',
    async (key) => {
      const target = document.createElement('div')
      document.body.appendChild(target)
      const collabSetup = await createCollaboration({
        room: `issue-115-def-${key}`,
        user: { name: 'Alice', color: '#f00' },
      })
      const inst = createEditor({
        target,
        plugins: defaultPlugins,
        collaboration: collabSetup,
      })
      try {
        inst.editor.commands.focus()
        inst.editor.commands.setImage({ src: 'https://example.com/x.png' })

        let imagePos = -1
        inst.editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image') {
            imagePos = pos
            return false
          }
          return true
        })
        expect(imagePos).toBeGreaterThanOrEqual(0)

        inst.editor.commands.setNodeSelection(imagePos)
        expect(inst.editor.state.selection).toBeInstanceOf(NodeSelection)

        inst.editor.view.dom.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        )

        const hasImage = inst.editor
          .getJSON()
          .content?.some((c) => c.type === 'image')
        expect(hasImage).toBe(false)
      } finally {
        inst.destroy()
        target.remove()
      }
    },
  )
})