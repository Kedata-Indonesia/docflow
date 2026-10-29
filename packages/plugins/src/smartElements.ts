import { definePlugin } from '@kedata-indonesia/docflow-core'
import { chipCommands, chipSlashCommands } from './chips/chipCommands.js'
import { DateChipNode } from './chips/dateChip.js'
import { DropdownChipNode } from './chips/dropdownChip.js'
import { FileChipNode } from './chips/fileChip.js'
import { LocationChipNode } from './chips/locationChip.js'
import { PeopleChipNode } from './chips/peopleChip.js'

/**
 * Smart Elements — Google-Docs-style interactive inline chips.
 *
 * Each chip is an inline atom node (`group: 'inline'`, `inline: true`,
 * `atom: true`) rendered through `addNodeView` so the host editor never stores
 * display text — only the canonical attributes. This mirrors the existing
 * footnote/citation node pattern and keeps copy-paste, export, and
 * collaboration (Yjs) working off a small JSON-serialisable attribute payload.
 *
 * Five chip kinds ship here per issue #148:
 *   1. `dateChip`     — date pill; click opens a native date picker.
 *   2. `peopleChip`   — @mention pill with an avatar initial.
 *   3. `fileChip`     — workspace-file link pill.
 *   4. `dropdownChip` — status dropdown (To Do / In Progress / …).
 *   5. `locationChip` — place/map pill.
 *
 * One file per chip lives in `chips/`, shared attribute helpers and the node-view
 * shell in `chips/chipShared.ts`, and the insert commands (including the
 * `window.prompt` fallback for v1, same as the link extension) in
 * `chips/chipCommands.ts`.
 */

export { DateChipNode } from './chips/dateChip.js'
export { DropdownChipNode } from './chips/dropdownChip.js'
export { FileChipNode } from './chips/fileChip.js'
export { LocationChipNode } from './chips/locationChip.js'
export { PeopleChipNode } from './chips/peopleChip.js'

export const smartElementsPlugin = definePlugin({
  id: 'smart-elements',
  tiptapExtensions: [
    DateChipNode,
    PeopleChipNode,
    FileChipNode,
    DropdownChipNode,
    LocationChipNode,
  ],
  slashCommands: chipSlashCommands,
  commands: chipCommands,
})
