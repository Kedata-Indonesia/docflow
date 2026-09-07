import * as Y from 'yjs'

/**
 * Origin marker for transactions created by the provisional-seed logic in
 * {@link seedEmptyFragment}. Every other transaction origin (provider sync,
 * y-indexeddb restore, remote clients, the y-prosemirror mirror) counts as
 * "real content arrived" for reconciliation purposes.
 */
export const PROVISIONAL_SEED_ORIGIN = 'docflow:provisional-seed'

export interface EmptyFragmentSeed {
  /** true when the fragment was empty and a provisional paragraph was inserted. */
  seeded: boolean
  /**
   * Unregisters the reconciliation observer. Idempotent. Call when the bound
   * editor (and therefore the collaboration session) is torn down.
   */
  dispose: () => void
}

/**
 * A paragraph with no text, marks or attributes — i.e. exactly the PM
 * document y-prosemirror refuses to mirror into Yjs (it compares against
 * `doc.type.createAndFill()`, which yields this same node). While such a
 * paragraph sits in ProseMirror with an *empty* Yjs fragment, every PM
 * transaction crashes in `y-prosemirror`'s undo plugin (`getRelativeSelection`
 * maps PM position > 0 into an empty fragment → lib0 `unexpectedCase`).
 */
function isPristineEmptyParagraph(element: Y.XmlElement): boolean {
  return element.length === 0 && Object.keys(element.getAttributes()).length === 0
}

/**
 * Bind-time reconciliation for the empty-fragment crash (issue fe-aktifai#230).
 *
 * ProseMirror always starts with one default empty paragraph, but
 * y-prosemirror deliberately never mirrors that pristine default into Yjs
 * (`sync-plugin` view.update compares against `createAndFill()` and sees "no
 * change"). The fragment therefore stays empty while PM shows a paragraph,
 * and ANY later transaction — even a no-op layout dispatch, or the first
 * keystroke in a brand-new empty room — crashes while the undo plugin maps the
 * old selection into the empty fragment.
 *
 * Fix: when the collaboration fragment is still empty at editor-bind time,
 * seed one *provisional* empty paragraph into it so PM and Yjs agree from the
 * very first render. A reconciliation observer then steps the provisional
 * paragraph aside as soon as non-local content arrives (existing rooms), so
 * the server-authoritative document is never polluted with a duplicate
 * trailing paragraph. If the user types into the provisional paragraph first
 * (e.g. a genuinely new empty room), it becomes real content and is kept —
 * plain concurrent-edit semantics.
 *
 * Caveat: on rooms that already hold server content, binding before the first
 * provider sync briefly publishes the provisional paragraph upstream; it is
 * removed again by the reconciliation on the next sync round-trip.
 *
 * Call BEFORE constructing the TipTap editor (the ySync plugin renders the
 * fragment into PM at view creation).
 */
export function seedEmptyFragment(doc: Y.Doc, field = 'default'): EmptyFragmentSeed {
  const fragment = doc.getXmlFragment(field)
  const paragraph = new Y.XmlElement('paragraph')

  const observer = (
    _events: Y.YEvent<Y.XmlFragment>[],
    transaction: Y.Transaction,
  ) => {
    if (transaction.origin === PROVISIONAL_SEED_ORIGIN) return
    // Already removed (deleted/replaced remotely) — nothing to reconcile.
    if (paragraph.parent !== fragment) return
    // The user typed into the provisional paragraph → it is real content now.
    if (!isPristineEmptyParagraph(paragraph)) return
    // Only step aside when the fragment gained real content beyond our seed.
    if (fragment.length < 2) return
    const index = fragment.toArray().indexOf(paragraph)
    if (index === -1) return
    doc.transact(() => {
      fragment.delete(index)
    }, PROVISIONAL_SEED_ORIGIN)
  }

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    fragment.unobserveDeep(observer)
  }

  if (fragment.length > 0) {
    return { seeded: false, dispose }
  }

  fragment.observeDeep(observer)
  doc.transact(() => {
    fragment.insert(0, [paragraph])
  }, PROVISIONAL_SEED_ORIGIN)

  return { seeded: true, dispose }
}
