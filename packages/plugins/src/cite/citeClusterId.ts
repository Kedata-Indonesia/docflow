let clusterSeq = 0

/**
 * Stable, unique-enough id for a citation cluster instance in a document.
 *
 * Called when a node is inserted and when a copy-paste clone needs repairing,
 * so the module-level counter is what keeps two clusters from sharing an id
 * inside the same millisecond.
 */
export function nextCitationId(): string {
  clusterSeq += 1
  return `cite-${Date.now().toString(36)}-${clusterSeq.toString(36)}`
}
