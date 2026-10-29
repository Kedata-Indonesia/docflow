/**
 * Sample data for the playground — the "host app" side of the contract.
 *
 * Everything here is what a real consumer would feed the library: a ProseMirror
 * document, comment threads, version snapshots and collaborators. The library
 * never fetches this data itself (see docs/reference/LIBRARY_CONTRACT.md).
 *
 * This file is only the manifest; the fixtures themselves live in `./fixtures`
 * (one module per concern) so no single file grows past a couple hundred lines.
 */

export type { PmDoc, PmMark, PmNode } from './fixtures/pm'
export {
  PRESETS,
  PAGE_SIZE_OPTIONS,
  type Preset,
  type PresetId,
} from './fixtures/presets'
export {
  SAMPLE_COLLABORATORS,
  SAMPLE_COMMENTS,
  SAMPLE_SNAPSHOTS,
} from './fixtures/collaboration'
export { SAMPLE_INJECTED_STYLE, SAMPLE_SOURCES } from './fixtures/citations'
