# @kedataindo/docflow-core

Headless open-source rich text editor for [DocFlow](https://github.com/Kedata-Indonesia/docflow) — A4 pagination, Yjs collaboration, and a plugin system. Not a code editor.

Framework-agnostic: use it directly, or via the [`@kedataindo/docflow-vue`](https://www.npmjs.com/package/@kedataindo/docflow-vue) component or [`@kedataindo/docflow-element`](https://www.npmjs.com/package/@kedataindo/docflow-element) Web Component.

## Install

```bash
npm install @kedataindo/docflow-core @kedataindo/docflow-plugins
```

## Usage

```ts
import { createEditor } from '@kedataindo/docflow-core'
import { defaultPlugins } from '@kedataindo/docflow-plugins'

const editor = createEditor({
  target: document.getElementById('editor-root')!,
  plugins: defaultPlugins,
  content: { type: 'doc', content: [] },
  onUpdate: (json) => console.log(json),
  collaboration: { room: 'my-doc', provider: 'webrtc', user: { name: 'Alice', color: '#3b82f6' } },
})

editor.getJSON()
editor.destroy()
```

Define custom plugins with `definePlugin` — see the [plugin system docs](https://github.com/Kedata-Indonesia/docflow/blob/main/docs/reference/API.md#plugin-system).

## Documentation

Full docs, live demo, and API reference: [github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
