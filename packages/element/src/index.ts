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

// Auto-registration is intentionally NOT called here.
// Consumers must explicitly call registerDocsEditor() to define the custom element.
// This prevents unwanted side effects when importing the module.
