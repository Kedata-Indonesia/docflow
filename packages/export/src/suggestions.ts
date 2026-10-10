import {
  DOMSerializer,
  Fragment,
  Node as PMNode,
  type Schema,
} from 'prosemirror-model'

/**
 * Track-changes suggestion handling for export (issues #27/#28, P4).
 *
 * Suggestions are ProseMirror marks (`packages/plugins/src/suggestChanges.ts`):
 * `suggestionInsert`, `suggestionDelete`, `suggestionFormat`. This module
 * resolves them in the exported document without touching the live editor.
 *
 * NOTE: the mark names must stay in sync with
 * `packages/plugins/src/suggestChanges.ts` (the export package does not depend
 * on the plugins package).
 */
export type SuggestionExportMode = 'accept' | 'reject' | 'annotate'

const SUGGESTION_MARKS = new Set(['suggestionInsert', 'suggestionDelete', 'suggestionFormat'])

const resolveText = (schema: Schema, node: PMNode, mode: Exclude<SuggestionExportMode, 'annotate'>) => {
  const marks = node.marks
  const hasDelete = marks.some(m => m.type.name === 'suggestionDelete')
  const hasInsert = marks.some(m => m.type.name === 'suggestionInsert')

  // Accept keeps insertions and drops deletions; reject is the inverse.
  if (mode === 'accept' && hasDelete) return null
  if (mode === 'reject' && hasInsert) return null

  let next = marks.filter(m => !SUGGESTION_MARKS.has(m.type.name))

  if (mode === 'accept') {
    for (const mark of marks) {
      if (mark.type.name !== 'suggestionFormat') continue
      const target = schema.marks[mark.attrs.format as string]
      if (!target) continue
      if (mark.attrs.delta === 'remove') {
        next = next.filter(m => m.type.name !== target.name)
      } else {
        next = [...next.filter(m => m.type.name !== target.name), target.create()]
      }
    }
  }
  return node.mark(next)
}

const resolveNode = (
  schema: Schema,
  node: PMNode,
  mode: Exclude<SuggestionExportMode, 'annotate'>,
): PMNode | null => {
  if (node.isText) return resolveText(schema, node, mode)
  if (node.isLeaf) return node
  const children: PMNode[] = []
  node.content.forEach(child => {
    const resolved = resolveNode(schema, child, mode)
    if (resolved) children.push(resolved)
  })
  return node.copy(Fragment.fromArray(children))
}

/**
 * Return a resolved copy of the document JSON for the given mode.
 * `annotate` returns the input unchanged (marks stay → suggestion markup in the
 * output HTML/JSON).
 */
export function resolveSuggestionDoc(
  schema: Schema,
  json: object,
  mode: SuggestionExportMode,
): object {
  if (mode === 'annotate') return json
  const doc = PMNode.fromJSON(schema, json)
  const resolved = resolveNode(schema, doc, mode)
  return (resolved ?? doc).toJSON()
}

/** Serialize a resolved document JSON back to an HTML string. */
export function docJsonToHtml(schema: Schema, json: object): string {
  const doc = PMNode.fromJSON(schema, json)
  const container = document.createElement('div')
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return container.innerHTML
}
