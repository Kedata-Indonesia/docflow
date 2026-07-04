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
    const res = await fetch(`${BASE}/api/auth/get-session`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data?.user ?? null
  } catch {
    return null
  }
}

export interface AuthProvider {
  id: string
  name: string
  type: 'social' | 'credentials'
}

export class RateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter = 60) {
    super('Rate limit exceeded')
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

export async function getAuthProviders(): Promise<AuthProvider[]> {
  const res = await fetch(`${BASE}/api/auth/providers`)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
    throw new RateLimitError(retryAfter)
  }
  if (!res.ok) return []
  const data = await res.json()
  return data.providers || []
}

export async function signInWithProvider(provider: string): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      provider,
      callbackURL: window.location.origin,
    }),
  })
  if (!res.ok) throw new Error(`Failed to sign in with ${provider}`)
  const data = await res.json()
  if (data.url) {
    window.location.href = data.url
  }
}

export async function signUpWithEmail(email: string, password: string, name: string): Promise<ApiUser> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, name }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Sign up failed')
  }
  const data = await res.json()
  return data.user
}

export async function signInWithEmail(email: string, password: string): Promise<ApiUser> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || 'Invalid email or password')
  }
  const data = await res.json()
  return data.user
}

export async function signInWithGoogle(): Promise<void> {
  return signInWithProvider('google')
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
