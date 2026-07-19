# Integrasi Collaboration dengan Auth Project Sendiri

Dokumen ini menjelaskan cara memasang fitur **real-time collaboration** DocsEditor di project kamu dengan **menggunakan sistem autentikasi yang sudah ada** — tidak perlu pindah ke Better Auth.

---

## Daftar Isi

- [Arsitektur](#arsitektur)
- [Opsi 1: WebRTC P2P (Tanpa Server)](#opsi-1-webrtc-p2p-tanpa-server)
- [Opsi 2: WebSocket + Auth Custom](#opsi-2-websocket--auth-custom)
  - [Client-Side Setup](#client-side-setup)
  - [Server-Side Setup](#server-side-setup)
  - [Auth Flow](#auth-flow)
- [Pola Auth yang Umum](#pola-auth-yang-umum)
  - [JWT (Bearer Token)](#jwt-bearer-token)
  - [Session Cookie](#session-cookie)
  - [API Key](#api-key)
- [Persistence (Opsional)](#persistence-opsional)
- [Security Checklist](#security-checklist)
- [Contoh Integrasi Lengkap](#contoh-integrasi-lengkap)

---

## Arsitektur

```
┌─────────────────────┐     WebSocket        ┌───────────────────────┐
│   Aplikasi Kamu     │ ◄──────────────────►  │   Server Kolaborasi   │
│                     │     ws://host/collab  │                       │
│  ┌───────────────┐  │                       │  ┌─────────────────┐  │
│  │  Auth System   │  │                       │  │  Auth Checker   │  │
│  │  (JWT/Session) │  │                       │  │  (kode kamu)    │  │
│  └───────┬───────┘  │                       │  └────────┬────────┘  │
│          │          │                       │           │            │
│  ┌───────▼───────┐  │                       │  ┌────────▼────────┐  │
│  │  DocsEditor   │  │                       │  │ y-websocket     │  │
│  │  + Yjs        │  │                       │  │ (setupWSConn.)  │  │
│  └───────────────┘  │                       │  └─────────────────┘  │
└─────────────────────┘                       └───────────────────────┘
```

**Poin penting:**

1. **Client → Server:** WebSocket koneksi. Auth dicek **sebelum** koneksi diterima (di HTTP upgrade).
2. **User awareness** (nama, warna cursor) dikirim terpisah setelah koneksi — tidak untuk auth, hanya untuk display.
3. **Yjs CRDT** menangani conflict resolution — semua peer setara, tidak ada master.

---

## Opsi 1: WebRTC P2P (Tanpa Server)

Paling sederhana. **Tidak perlu server, tidak perlu auth.** Cocok untuk prototyping, LAN, atau demo.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import '@kedata-indonesia/docflow-vue/style.css'

const collaborationOptions = {
  room: 'meeting-notes-2024',
  provider: 'webrtc',
  user: {
    name: 'Budi',
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

**Cara kerja:** Semua user di `room` yang sama saling sync via WebRTC — data tidak lewat server manapun. Signaling default sudah include.

---

## Opsi 2: WebSocket + Auth Custom

Untuk production. Kamu perlu **server sendiri** yang handle WebSocket + auth.

### Client-Side Setup

#### Via Vue Component

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import '@kedata-indonesia/docflow-vue/style.css'

// — Ambil data user dari auth system kamu —
// Bisa dari Pinia store, Vuex, localStorage JWT, dll.
const user = computed(() => ({
  id: authStore.user.id,
  name: authStore.user.name,
  color: getUserColor(authStore.user.id),  // hash color dari user ID
}))

const collaborationOptions = computed(() => ({
  room: `doc-${docId}`,
  provider: 'websocket',
  websocketUrl: import.meta.env.VITE_COLLAB_WS_URL,
  user: {
    name: user.value.name,
    color: user.value.color,
  },
}))
</script>

<template>
  <DocsEditor
    :model-value="content"
    :plugins="defaultPlugins"
    :collaboration="collaborationOptions"
  />
</template>
```

#### Via Core API (Headless / React / Vanilla)

```ts
import { createEditor } from '@kedata-indonesia/docflow-core'

const editor = createEditor({
  target: document.getElementById('editor'),
  content: initialDoc,
  plugins: myPlugins,
  collaboration: {
    room: 'doc-abc123',
    provider: 'websocket',
    websocketUrl: 'wss://api.example.com/collab',
    user: {
      name: currentUser.name,
      color: hashColor(currentUser.id),
    },
  },
})

// Akses Yjs langsung jika perlu
editor.collab?.ydoc        // → Y.Doc (CRDT data)
editor.collab?.awareness   // → Awareness (cursor position, presence)
editor.collab?.provider    // → WebsocketProvider / WebrtcProvider
editor.collab?.destroy()   // → cleanup

// Dapatkan daftar user online
editor.collab?.awareness.on('change', () => {
  const states = []
  editor.collab?.awareness.getStates().forEach((state, clientId) => {
    states.push({ clientId, user: state.user })
  })
  console.log('Online:', states)
})
```

### Server-Side Setup

Ini adalah bagian **paling kritis**. Kamu perlu:

1. **HTTP server** (Express, Fastify, Hono, dll)
2. **WebSocket server** (`ws` library)
3. **Auth checker** di event `upgrade` — panggil **sebelum** `setupWSConnection`

#### Minimal Server

```ts
import http from 'http'
import { WebSocketServer } from 'ws'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { setupWSConnection } = require('./node_modules/y-websocket/utils.cjs')
// ↑ Atau copy utils.cjs dari y-websocket ke project kamu

const server = http.createServer(app)  // app Express-mu
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', async (request, socket, head) => {
  // ——— AUTH CUSTOM DI SINI ———
  // request.headers: cookie, authorization, dll.
  // Balik: userId (string) atau null (reject)

  const userId = await authenticateRequest(request)
  if (!userId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  // Cek akses room (opsional — sesuai kebutuhan)
  const roomId = decodeURIComponent(
    (request.url?.split('?')[0] ?? '').replace(/^\/collab\/?/, '') || 'default'
  )
  if (!(await canAccessRoom(userId, roomId))) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }

  // ——— SETUP Yjs WebSocket ———
  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWSConnection(ws, request, { docName: roomId, gc: true })
  })
})

server.listen(PORT)
```

#### Fungsi `authenticateRequest` — Kamu yang buat

```ts
async function authenticateRequest(
  request: http.IncomingMessage
): Promise<string | null> {
  // — Contoh 1: Bearer JWT —
  const auth = request.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      return payload.sub  // atau payload.userId
    } catch {
      return null
    }
  }

  // — Contoh 2: Session cookie —
  // parse cookie, cari session di DB/Redis
  // const sessionId = parseCookies(request.headers.cookie).session
  // const user = await db.sessions.find(sessionId)
  // return user?.id ?? null

  return null
}
```

#### Fungsi `canAccessRoom` — Opsional

Hanya perlu jika kamu punya sistem permission. Contoh:

```ts
async function canAccessRoom(userId: string, roomId: string): Promise<boolean> {
  // roomId format: "doc-<mongoId>" atau sesuai skema kamu
  const docId = roomId.replace(/^doc-/, '')

  // Cek apakah user adalah owner atau collaborator dokumen ini
  const doc = await db.documents.findOne({
    _id: docId,
    $or: [{ owner: userId }, { collaborators: userId }],
  })

  return doc != null
}
```

Atau kalau semua user boleh akses semua room (misal internal tool):

```ts
async function canAccessRoom(_userId: string, _roomId: string): Promise<boolean> {
  return true  // semua terautentikasi boleh akses
}
```

---

## Auth Flow Lengkap (Diagram)

```
Browser                              Server
  │                                    │
  │  1. Login (sesuai auth system kamu)│
  │  ───────────────────────────────►  │
  │  ◄───────────────────────────────  │
  │         { token / session cookie } │
  │                                    │
  │  2. Buka dokumen                  │
  │     DocsEditor + collaboration     │
  │                                    │
  │  3. WebSocket connect             │
  │     ws://host/collab/doc-xxx       │
  │     + cookie / Authorization header│
  │  ───────────────────────────────►  │
  │                                    │  4. Auth checker
  │                                    │     ─ token valid?
  │                                    │     ─ user boleh akses room?
  │                                    │
  │       ◄──────── OR ────────────────│
  │       HTTP 401/403 + close socket  │
  │                                    │
  │       ◄──────── OR ────────────────│
  │       WebSocket accepted           │  5. setupWSConnection()
  │       Yjs sync starts              │     ─ Y.Doc in memory
  │  ◄───────────────────────────────  │     ─ Awareness
  │                                    │
  │  6. Collaboration aktif            │
  │     ─ typing, cursor,             │
  │     ─ real-time sync              │
```

---

## Pola Auth yang Umum

### JWT (Bearer Token)

**Client:**

```ts
const collaborationOptions = {
  room: `doc-${docId}`,
  provider: 'websocket',
  websocketUrl: 'wss://api.example.com/collab',
  user: { name: user.name, color: user.color },
}

// JWT dikirim sebagai cookie atau query parameter
// Karena WebSocket API browser tidak bisa set custom header,
// gunakan cookie atau URL query:
//   wss://api.example.com/collab/doc-xxx?token=...
```

**Catatan:** WebSocket browser API (`new WebSocket()`) **tidak bisa** mengirim custom header. Ada dua solusi:

| Metode | Cara | Kelebihan | Kekurangan |
|--------|------|-----------|------------|
| **Cookie** | Set cookie, kirim otomatis | Paling sederhana | Rawan CSRF tanpa SameSite |
| **Query param** | `ws://host/collab/room?token=xxx` | Explicit | Token bocor di log server |
| **Auth dulu, baru WebSocket** | REST login → dapat session cookie → WebSocket pakai cookie itu | Standar | Perlu session store |

**Rekomendasi: pakai cookie.** Yjs WebsocketProvider mengirim cookie browser otomatis (sama seperti fetch).

### Session Cookie

**Server:**

```ts
async function authenticateRequest(request: http.IncomingMessage) {
  const cookie = request.headers.cookie
  if (!cookie) return null

  // Parse session dari cookie → Redis / DB
  const sessionId = parseCookie(cookie).session_id
  if (!sessionId) return null

  const session = await redis.get(`session:${sessionId}`)
  return session?.userId ?? null
}
```

### API Key (Machine-to-Machine)

Untuk kasus server-to-server atau integration testing:

```ts
async function authenticateRequest(request: http.IncomingMessage) {
  const apiKey = request.headers['x-api-key']
  if (!apiKey) return null

  const key = await db.apiKeys.findOne({ key: apiKey })
  return key?.userId ?? null
}
```

---

## Persistence (Opsional)

Tanpa persistence, data kolaborasi **hilang** saat semua user disconnect. Ada opsi:

### Opsi A: Pakai Persistence Bawaan (MongoDB)

Server docflow (`apps/server`) sudah punya `createMongoPersistence()`. Kamu bisa pakai langsung:

```ts
import { createMongoPersistence } from '@kedata-indonesia/docflow-server/y-websocket/mongoPersistence'

setPersistence(createMongoPersistence())
```

Syarat: Mongoose + model `CollabState` (roomId, state Buffer, updatedAt).

### Opsi B: Pakai LevelDB (y-websocket bawaan)

```bash
# Set environment variable
YPERSISTENCE=./data/yjs-docs
```

`setPersistence` dari `utils.cjs` otomatis baca `YPERSISTENCE` — langsung jalan tanpa setup database.

### Opsi C: Buat Persistence Sendiri

Implement interface `bindState` dan `writeState`:

```ts
import { setPersistence } from './utils.cjs'

setPersistence({
  bindState: async (docName, ydoc) => {
    // Load state dari storage → apply ke ydoc
    const data = await myStorage.get(docName)
    if (data) Y.applyUpdate(ydoc, data)

    // Auto-save saat ada perubahan
    ydoc.on('update', (update) => {
      debouncedSave(docName, Y.encodeStateAsUpdate(ydoc))
    })
  },
  writeState: async (docName, ydoc) => {
    // Simpan final state saat last user disconnect
    const state = Y.encodeStateAsUpdate(ydoc)
    await myStorage.set(docName, state)
    ydoc.destroy()
  },
})
```

---

## Security Checklist

- [ ] **Auth di WebSocket upgrade** — jangan hanya di REST endpoint. Semua koneksi WebSocket harus diautentikasi.
- [ ] **Room isolation** — pastikan user di room A tidak bisa subscribe room B.
- [ ] **Rate limit WebSocket** — batasi koneksi per user (misal maks 5 per user ID).
- [ ] **Origin check** — validasi `request.headers.origin` di server (cegah WebSocket hijacking).
- [ ] **CORS** — REST API pakai CORS terbatas (jangan `*` dengan credentials).
- [ ] **Jangan expose Yjs state ke client** — Yjs binary state cukup besar; jangan kirim via REST kecuali perlu.
- [ ] **HTTPS / WSS** — selalu pakai TLS di production.
- [ ] **Persistence encryption** — data Yjs di database berisi full dokumen; encrypt-at-rest jika perlu.

---

## Contoh Integrasi Lengkap

### Express + JWT Auth + WebSocket

```ts
import express from 'express'
import http from 'http'
import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { setupWSConnection } = require('y-websocket/utils.cjs')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true })

// — Auth checker —
const JWT_SECRET = process.env.JWT_SECRET!

async function authenticateRequest(request) {
  // Coba dari cookie dulu
  const cookie = request.headers.cookie
  if (cookie) {
    const token = cookie
      .split(';')
      .find(c => c.trim().startsWith('token='))
      ?.split('=')[1]
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET)
        return payload.userId
      } catch { /* lanjut ke metode lain */ }
    }
  }

  // Fallback ke Authorization header
  const auth = request.headers.authorization
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET)
      return payload.userId
    } catch { return null }
  }

  return null
}

// — WebSocket upgrade —
server.on('upgrade', async (request, socket, head) => {
  const userId = await authenticateRequest(request)
  if (!userId) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  // Cek origin
  if (request.headers.origin !== process.env.APP_ORIGIN) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    socket.destroy()
    return
  }

  const pathname = request.url?.split('?')[0] ?? ''
  const roomId = decodeURIComponent(pathname.replace(/^\/collab\/?/, '') || 'default')

  // Cek akses room (contoh sederhana: semua user terautentikasi boleh akses)
  // Kalau perlu permission per-doc, tambahkan logic di sini

  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWSConnection(ws, request, { docName: roomId, gc: true })
  })
})

// — REST API biasa —
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

server.listen(4000, () => {
  console.log('Server running on :4000')
})
```

### Client Vue (pakai cookie JWT)

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { DocsEditor } from '@kedata-indonesia/docflow-vue'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import '@kedata-indonesia/docflow-vue/style.css'
import { useAuth } from './stores/auth'

const auth = useAuth()
const docId = route.params.id

// Ambil warna dari user ID — biar konsisten antar sesi
function colorFromId(id: string): string {
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const collaborationOptions = computed(() => ({
  room: `doc-${docId}`,
  provider: 'websocket',
  websocketUrl: import.meta.env.VITE_WS_URL || 'wss://api.example.com/collab',
  user: {
    name: auth.user.name,
    color: colorFromId(auth.user.id),
  },
}))

// Pastikan cookie JWT sudah ada (dari login)
onMounted(() => {
  if (!auth.isLoggedIn) auth.redirectToLogin()
})
</script>

<template>
  <DocsEditor
    :model-value="content"
    :plugins="defaultPlugins"
    :collaboration="collaborationOptions"
    :title="docTitle"
    @ready="onEditorReady"
  />
</template>
```

---

## Troubleshooting

| Masalah | Kemungkinan Penyebab | Solusi |
|---------|---------------------|--------|
| WebSocket 401 terus | Cookie/token tidak terkirim | Cek `request.headers.cookie` atau `authorization` di server. Browser tidak kirim cookie cross-origin — pastikan `SameSite` sesuai. |
| Cursor collaborator tidak muncul | Awareness tidak nyambung | Pastikan `user.name` dan `user.color` dikirim. Cek `onAwarenessChange` callback. |
| Yjs conflict / teks ganda | Dual instance Yjs | Pastikan Vite config punya `dedupe: ['yjs']`. Pastikan server & client pakai yjs instance yang sama (via `createRequire` di server). |
| WebSocket disconnect tiap 30 detik | Ping/pong timeout | y-websocket default ping 30 detik. Pastikan tidak ada proxy/load balancer yang kill idle connection. |
| Dokumen tidak tersimpan setelah semua user keluar | Persistence tidak aktif | Set persistence sebelum koneksi masuk: `setPersistence(createMongoPersistence())` atau `YPERSISTENCE=./data`. |

---

## Referensi

- [PRD — Collaboration Section](../PRD.md#43-collaboration-fase-3)
- [Phase 1 Plan: Collab + Persistence](./plans/phase-1-collab-persistence.md)
- [Yjs Documentation](https://docs.yjs.dev)
- [y-websocket Server](https://github.com/yjs/y-websocket)
