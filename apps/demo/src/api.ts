/**
 * DocsEditor API Client
 *
 * Auth endpoints handled by Better Auth at /api/auth/*
 */

const BASE = ''

export interface ApiUser {
  id: string
  email: string
  name: string
  image?: string
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

// ─── Auth (Better Auth) ─────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<ApiUser | null> {
  try {
    const res = await fetch(`${BASE}/api/auth/session`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data?.user ?? null
  } catch {
    return null
  }
}

export async function signInWithGoogle(): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: window.location.origin,
    }),
  })
  if (!res.ok) throw new Error('Failed to initiate sign-in')
  const data = await res.json()
  // Better Auth returns { url } — redirect browser to Google OAuth
  if (data.url) {
    window.location.href = data.url
  }
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE}/api/auth/sign-out`, {
    method: 'POST',
    credentials: 'include',
  })
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
