/**
 * Cache fingerprints for `PageLayout`.
 *
 * A block's fingerprint covers everything the layout reads from the DOM:
 * tag, ProseMirror positions, node type and text. Widths are deliberately left
 * out — they come from the container size, which is tracked separately — so
 * re-measuring a container does not look like a document edit.
 */

export function blockFingerprint(child: HTMLElement): string {
  return child.tagName +
    (child.getAttribute('data-from') ?? '') +
    (child.getAttribute('data-to') ?? '') +
    (child.getAttribute('data-node-type') ?? '') +
    (child.textContent ?? '')
}

/** Single hash over the whole document, used for the fast "nothing changed" path. */
export function computeDocHash(container: HTMLElement): string {
  let hash = ''
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement) hash += blockFingerprint(child)
  }
  return hash
}

/**
 * Per-block hashes for incremental recalculation. The index counts every DOM
 * child (not just elements) so a fingerprint never shifts onto its neighbour.
 */
export function computeBlockHashes(container: HTMLElement): Map<number, string> {
  const map = new Map<number, string>()
  let idx = 0
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement) map.set(idx, blockFingerprint(child))
    idx++
  }
  return map
}
