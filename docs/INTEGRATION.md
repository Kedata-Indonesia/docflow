# Integration Guide — Using DocsEditor in Your Project

## Quick Start (Vue 3)

### Install

```bash
# Install from the public npm registry (no extra registry config needed)
npm install @kedataindo/docflow-vue @kedataindo/docflow-plugins
```

### Basic Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DocsEditor } from '@kedataindo/docflow-vue'
import { defaultPlugins } from '@kedataindo/docflow-plugins'
// Import CSS
import '@kedataindo/docflow-vue/style.css'

const content = ref({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello World' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Start writing...' }] },
  ],
})

function handleUpdate(json: object) {
  content.value = json
}
</script>

<template>
  <DocsEditor
    :model-value="content"
    :plugins="defaultPlugins"
    :editable="true"
    title="My Document"
    page-size="a4"
    @update:model-value="handleUpdate"
  />
</template>
```

## With Collaboration (WebRTC P2P)

```vue
<script setup lang="ts">
const collaborationOptions = {
  room: 'my-document-room',
  provider: 'webrtc',        // P2P, no server needed
  user: {
    name: 'John Doe',
    color: '#3b82f6',
  },
}
</script>

<template>
  <DocsEditor
    :model-value="content"
    :plugins="defaultPlugins"
    :collaboration="collaborationOptions"
  />
</template>
```

Multiple users with the same `room` will auto-sync via WebRTC.

## With Collaboration (WebSocket Server)

```vue
<script setup lang="ts">
const collaborationOptions = {
  room: 'my-document-room',
  provider: 'websocket',
  websocketUrl: 'wss://your-server.com',
  user: { name: 'John', color: '#3b82f6' },
}
</script>
```

## Web Component (Framework Agnostic)

```html
<script type="module">
  import { registerDocsEditor } from '@kedataindo/docflow-element'
  registerDocsEditor()
</script>

<docs-editor
  room="doc-123"
  theme="light"
  editable="true"
></docs-editor>
```

### Web Component Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `room` | string | Collaboration room name |
| `theme` | `"light"` \| `"dark"` | Editor theme |
| `editable` | `"true"` \| `"false"` | Enable editing |
| `content` | JSON string | Initial document content |
| `websocket-url` | string | WebSocket server for collab |

## DocsEditor Component Props

```ts
interface DocsEditorProps {
  modelValue: object           // TipTap JSON document content
  plugins: DocsEditorPlugin[]  // Editor plugins
  editable?: boolean           // Enable editing (default: true)
  title?: string               // Document title
  starred?: boolean            // Starred state
  pageSize?: string            // 'a4' | 'legal' | 'letter'
  collaboration?: {            // Collaboration options
    room: string
    provider?: 'webrtc' | 'websocket'
    websocketUrl?: string
    user: { name: string; color: string }
  }
  connectionState?: string     // UI indicator: 'connected' | 'disconnected'
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `@update:model-value` | `object` | Document content changed |
| `@update:title` | `string` | Title changed |
| `@toggle-star` | — | Star toggled |
| `@back` | — | Back button clicked |
| `@share` | — | Share button clicked |
| `@ready` | `DocsEditor` | Editor fully initialized |
| `@update:page-size` | `string` | Page size changed |

### Slots

| Slot | Description |
|------|-------------|
| `#header-actions` | Custom buttons in header bar |

## Core API (Headless)

```ts
import { createEditor } from '@kedataindo/docflow-core'

const editor = createEditor({
  target: document.getElementById('editor'),
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  plugins: [...],
  editable: true,
  onUpdate: (json) => console.log('changed:', json),
  collaboration: {
    room: 'my-room',
    provider: 'webrtc',
    user: { name: 'Me', color: '#3b82f6' },
  },
})

// Methods
editor.getJSON()      // → TipTap JSON
editor.getHTML()      // → HTML string
editor.destroy()      // → cleanup
editor.use(plugin)    // → add plugin at runtime
editor.pluginActions  // → { insertImage, insertTable, ... }

// Collaboration access
editor.collab?.ydoc        // → Y.Doc (CRDT)
editor.collab?.awareness   // → Awareness (cursors, presence)
```

## Custom Plugin

```ts
import { definePlugin } from '@kedataindo/docflow-core'
import { Extension } from '@tiptap/core'

const MyPlugin = definePlugin({
  id: 'my-feature',
  tiptapExtensions: [
    Extension.create({
      name: 'myFeature',
      // ... TipTap extension config
    }),
  ],
  toolbar: [
    { id: 'my-action', label: 'My Action', action: 'doSomething' },
  ],
  slashCommands: [
    { name: 'My Command', command: 'doSomething' },
  ],
  commands: {
    doSomething: (editor) => {
      editor.chain().focus().insertContent('Hello!').run()
      return true
    },
  },
  hooks: {
    onInit: (editor) => {
      console.log('Plugin initialized')
    },
    onDestroy: (editor) => {
      console.log('Plugin destroyed')
    },
  },
})
```

## React / Other Frameworks

Use the **Web Component** (`@kedataindo/docflow-element`) or the **Core API** (`@kedataindo/docflow-core`).

### React Example

```tsx
import { useEffect, useRef } from 'react'
import { createEditor } from '@kedataindo/docflow-core'

function EditorComponent() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const editor = createEditor({
      target: ref.current,
      plugins: [...],
    })
    return () => editor.destroy()
  }, [])

  return <div ref={ref} />
}
```

## Backend Integration

The server (`apps/server`) provides:

```
Base URL: https://your-server.com

Auth:
  POST /api/auth/sign-up/email     ← register
  POST /api/auth/sign-in/email     ← login
  GET  /api/auth/get-session       ← current user
  POST /api/auth/sign-out          ← logout
  GET  /api/auth/providers         ← enabled providers

Documents:
  GET    /api/documents             ← list user's docs
  POST   /api/documents             ← create doc
  GET    /api/documents/:id         ← get doc (any authenticated user)
  PUT    /api/documents/:id         ← update doc (owner only)
  DELETE /api/documents/:id         ← delete doc (owner only)

Collaboration:
  POST /api/collab/heartbeat        ← update presence
  GET  /api/collab/online/:roomId   ← online users
  POST /api/collab/seed             ← one-time guarded seed for legacy JSON-only
                                      docs (room access checked; first caller wins)

Yjs document state is authoritative and persisted server-side to MongoDB
automatically (no client snapshot API — removed in Phase 1). Connect via the
websocket provider and the server loads/persists state for you.
```

All requests need: `credentials: 'include'` (cookie-based) or `Authorization: Bearer <token>` (JWT mode).

## Peer Dependencies

Your project must also install these:

```json
{
  "dependencies": {
    "vue": "^3.5.0",
    "@tiptap/core": "^2.11.0",
    "@tiptap/starter-kit": "^2.11.0",
    "tiptap-pagination-plus": "3.1.0",
    "yjs": "^13.6.0",
    "y-prosemirror": "^1.2.0",
    "y-webrtc": "^10.3.0",
    "y-websocket": "^2.0.4"
  }
}
```

Or just install the vue package — npm 7+ and pnpm auto-install its *required* peers.
The optional peers that are **not** also regular dependencies (`y-webrtc`,
`y-websocket`) are not auto-installed, so add them yourself:

```bash
npm install y-webrtc y-websocket
```
