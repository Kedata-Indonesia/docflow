import { Extension, type AnyExtension } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import { yCursorPlugin } from '@tiptap/y-tiptap'
import type { Awareness } from 'y-protocols/awareness'
import type { CollaborationSetup } from './collaborationTypes.js'

/**
 * Remote-cursor extension.
 *
 * TipTap v3 moved its Yjs integration to the `@tiptap/y-tiptap` fork, and the
 * standalone `@tiptap/extension-collaboration-cursor` package has no v3 release:
 * its `3.0.0` build is a mis-tagged 2.5.0 ("we meant to release 2.5.0") that
 * still registers `y-prosemirror`'s cursor plugin. Under v3's editor mount the
 * cursor plugin's `init` runs before the fork's `y-sync$` state exists, so it
 * throws `Cannot read properties of undefined (reading 'doc')` and the editor
 * never mounts. Until upstream ships a v3 cursor extension, docflow registers
 * the fork's own `yCursorPlugin` — the awareness contract is unchanged
 * (`user` / `cursor` fields, as published by `createCollaboration`).
 */
const CollaborationCursor = Extension.create<{
  provider: { awareness: Awareness } | null
  user: { name: string; color: string }
}>({
  name: 'collaborationCursor',
  addOptions() {
    return { provider: null, user: { name: '', color: '' } }
  },
  addProseMirrorPlugins() {
    const awareness = this.options.provider?.awareness
    if (!awareness) return []
    return [yCursorPlugin(awareness)]
  },
})

/**
 * Build the TipTap extensions for a collaboration setup.
 *
 * Takes a `CollaborationSetup` on purpose: the setup owns a Y.Doc, an
 * awareness instance and (with a provider) a live socket, so the caller must
 * hold the handle that can `destroy()` them. Accepting plain
 * `CollaborationOptions` here used to build a setup nobody could dispose —
 * a live room connection leaked per mount (issue #372).
 */
export function collaborationExtensions(setup: CollaborationSetup): AnyExtension[] {
  const extensions: AnyExtension[] = [
    Collaboration.configure({ document: setup.ydoc }),
  ]

  if (setup.provider) {
    extensions.push(
      CollaborationCursor.configure({
        provider: setup.provider,
        user: setup.awareness.getLocalState()?.user ?? { name: '', color: '' },
      }),
    )
  }

  return extensions
}
