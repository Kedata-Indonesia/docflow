/**
 * Shared DOM mechanics for the two HTML sanitizers.
 *
 * `sanitizeInlineHTML` (header/footer templates) and `normalizeClipboardHTML`
 * (paste) keep their own allow/deny lists, but the tree surgery is identical:
 * unwrapping, comment removal, subtree removal and the post-order walk. Keeping
 * one copy means a new dangerous tag or a traversal fix cannot land in only one
 * pipeline (issue #378).
 */

/** Replace an element with its children (keep text, drop the wrapper). */
export function unwrap(el: Element): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

export function removeComments(root: Node): void {
  const doc = root.ownerDocument
  if (!doc) return
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */)
  const comments: Node[] = []
  let node = walker.nextNode()
  while (node) {
    comments.push(node)
    node = walker.nextNode()
  }
  for (const comment of comments) comment.parentNode?.removeChild(comment)
}

/** Remove every element matching `tags` together with its whole subtree. */
export function removeElementsWithSubtree(root: Element, tags: Iterable<string>): void {
  for (const tag of tags) {
    for (const el of Array.from(root.getElementsByTagName(tag))) {
      el.parentNode?.removeChild(el)
    }
  }
}

/**
 * Visit every element under `root` after its children, so a parent can safely
 * be unwrapped or replaced once its subtree has been normalized.
 */
export function walkElementsPostOrder(root: Node, visit: (el: Element) => void): void {
  const walk = (node: Node): void => {
    if (node.nodeType !== 1) return
    for (const child of Array.from(node.childNodes)) walk(child)
    visit(node as Element)
  }
  for (const child of Array.from(root.childNodes)) walk(child)
}
