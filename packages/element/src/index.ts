import { DocsEditorElement } from './DocsEditorElement.js'

export { DocsEditorElement }

export function registerDocsEditor(
  tagName = 'docs-editor',
  registry: CustomElementRegistry | undefined = typeof customElements !== 'undefined' ? customElements : undefined,
) {
  if (registry && !registry.get(tagName)) {
    registry.define(tagName, DocsEditorElement)
  }
}

if (typeof window !== 'undefined') {
  registerDocsEditor()
}
