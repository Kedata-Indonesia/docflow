# @kedataindo/docflow-element

`<docs-editor>` Web Component for [DocFlow](https://github.com/Kedata-Indonesia/docflow) — an open-source rich text editor with true A4 pagination, real-time collaboration, and layout-aware AI hooks.

Framework-agnostic: works in any HTML page, React, Angular, Svelte, or plain JS. Wraps the Vue component in a shadow-DOM custom element.

## Install

```bash
npm install @kedataindo/docflow-element @kedataindo/docflow-plugins
```

## Usage

```html
<script type="module">
  import { registerDocsEditor } from '@kedataindo/docflow-element'
  import { defaultPlugins } from '@kedataindo/docflow-plugins'

  registerDocsEditor() // defines <docs-editor>; auto-registration is intentionally off

  // module scripts are deferred, so the element below is already in the DOM
  document.querySelector('docs-editor').plugins = defaultPlugins
</script>

<docs-editor
  room="my-doc"
  theme="light"
  editable="true"
  content='{"type":"doc","content":[]}'
  websocket-url="wss://your-collab-server"
></docs-editor>
```

## Documentation

Attributes, events, and live demo: [github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
