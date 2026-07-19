export interface DocumentItem {
  id: string       // maps to API _id
  title: string
  content: object
  folderId: string | null
  starred: boolean
  visibility: 'private' | 'restricted'
  deletedAt: Date | null
  updatedAt: number
  createdAt: number
}

export interface FolderItem {
  id: string
  name: string
}

export interface DocumentMeta {
  id: string
  title: string
  owner: { userId: string; name: string; email: string }
  collaborators: string[]
  visibility: 'private' | 'restricted'
  starred: boolean
  folderId: string | null
  createdAt: string
  updatedAt: string
  plainText: string
}

export interface UserInfo {
  id: string
  email: string
  displayName: string
  avatar?: string
}
