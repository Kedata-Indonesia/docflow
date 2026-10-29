import type { BlockInfo, LayoutResult, Page } from '../types'

export interface IncrementalMergeOptions {
  /** Freshly computed pages for the whole document. */
  allPages: Page[]
  /** Result of the previous run, when there is one. */
  previous: LayoutResult | null
  /** A container resize invalidates every page boundary. */
  containerChanged: boolean
  previousBlockHashes: Map<number, string>
  blockHashes: Map<number, string>
  blocks: BlockInfo[]
}

/**
 * Reuse unchanged head pages from the previous result.
 *
 * Recomputation is cheap (integer arithmetic), but replacing every page object
 * makes every downstream consumer redraw. So when only tail blocks changed and
 * the last reused page still ends at the same document position, the head pages
 * are kept as-is and only the tail is swapped in.
 */
export function mergeIncrementalPages(options: IncrementalMergeOptions): Page[] {
  const { allPages, previous, containerChanged, previousBlockHashes, blockHashes, blocks } = options

  if (!previous || containerChanged || previousBlockHashes.size === 0) return allPages

  let firstChangedBlockIdx = -1
  for (let i = 0; i < blocks.length; i++) {
    if (blockHashes.get(i) !== previousBlockHashes.get(i)) {
      firstChangedBlockIdx = i
      break
    }
  }
  if (firstChangedBlockIdx === -1 && blockHashes.size !== previousBlockHashes.size) {
    firstChangedBlockIdx = Math.min(blockHashes.size, previousBlockHashes.size)
  }
  if (firstChangedBlockIdx < 0) return allPages

  const firstChangedFrom = blocks[firstChangedBlockIdx]?.from ?? 0
  const oldPages = previous.pages
  let affectedPageIdx = oldPages.length

  for (let p = 0; p < oldPages.length; p++) {
    const pageBlocks = oldPages[p].blocks
    const lastBlock = pageBlocks[pageBlocks.length - 1]
    if (lastBlock && lastBlock.to >= firstChangedFrom) {
      affectedPageIdx = p
      break
    }
  }

  // Try to reuse head pages if their boundaries match.
  const boundaryMatches = affectedPageIdx > 0
    && affectedPageIdx < allPages.length
    && oldPages[affectedPageIdx - 1]?.to === allPages[affectedPageIdx - 1]?.to

  return boundaryMatches
    ? [...oldPages.slice(0, affectedPageIdx), ...allPages.slice(affectedPageIdx)]
    : allPages
}
