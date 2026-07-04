/**
 * DocsEditor API Client
 *
 * All requests include credentials (cookies) for session-based auth.
 * In dev mode, Vite proxies /api and /auth to the backend server.
 */

const BASE = '' // relative to origin; Vite proxies /api/* and /auth/*

export interface ApiUser {
  id: string
  email: string
  displayName: string
  avatar?: string
}

export interface ApiDoc {
  _id: string
  title: string
  content: object
  plainText: string
  owner: string
  starred: boolean
  folderId: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiDocListItem {
  _id: string
  title: string
  starred: boolean
  folderId: string | null
  createdAt: string
  updatedAt: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<ApiUser | null> {
  const res = await fetch(`${BASE}/auth/user`, { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json()
  return data.authenticated ? data.user : null
}

export function loginWithGoogle(): void {
  window.location.href = `${BASE}/auth/google`
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function fetchDocuments(): Promise<ApiDocListItem[]> {
  const res = await fetch(`${BASE}/api/documents`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`)
  return res.json()
}

export async function fetchDocument(id: string): Promise<ApiDoc> {
  const res = await fetch(`${BASE}/api/documents/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`)
  return res.json()
}

export async function createDocument(data: {
  title: string
  content: object
  folderId?: string | null
}): Promise<ApiDoc> {
  const res = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to create document: ${res.status}`)
  return res.json()
}

export async function updateDocument(
  id: string,
  updates: Partial<Pick<ApiDoc, 'title' | 'content' | 'starred' | 'folderId'>>,
): Promise<ApiDocListItem> {
  const res = await fetch(`${BASE}/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update document: ${res.status}`)
  return res.json()
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/documents/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to delete document: ${res.status}`)
}
