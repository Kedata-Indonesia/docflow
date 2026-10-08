# @kedataindo/docflow-vue

Vue 3 component + composables for [DocFlow](https://github.com/Kedata-Indonesia/docflow) — the open-source editor engine for document-style apps with true A4 pagination, real-time collaboration, and layout-aware AI hooks.

Ships a complete Google-Docs-like UI: toolbar, bubble/slash menus, rulers, sidebars, dark mode. Wires `@kedataindo/docflow-core` and the pagination engine together.

## Install

```bash
npm install @kedataindo/docflow-vue @kedataindo/docflow-plugins
```

> Peers: also add `y-webrtc` and `y-websocket` (`npm install y-webrtc y-websocket`).
> The core barrel imports them at load time, so strict ESM bundlers fail to
> resolve it even when `collaboration` is off.

## Usage

```vue
<script setup lang="ts">
import { DocsEditor } from '@kedataindo/docflow-vue'
import { defaultPlugins } from '@kedataindo/docflow-plugins'
import '@kedataindo/docflow-vue/style.css'

const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world!' }] }],
}
</script>

<template>
  <DocsEditor :model-value="content" :plugins="defaultPlugins" />
</template>
```

For a custom UI, use the `useEditor` composable with `EditorToolbar` / `BubbleMenu` — see the [API reference](https://github.com/Kedata-Indonesia/docflow#useeditor-vue---custom-ui).

## Documentation

Props, events, slots, and live demo: [github.com/Kedata-Indonesia/docflow](https://github.com/Kedata-Indonesia/docflow)

## License

Apache-2.0 — free to embed, forever.
