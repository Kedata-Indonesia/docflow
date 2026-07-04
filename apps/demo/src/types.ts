export interface DocumentItem {
  id: string       // maps to API _id
  title: string
  content: object
  folderId: string | null
  starred: boolean
  updatedAt: number
  createdAt: number
}

export interface FolderItem {
  id: string
  name: string
}

export interface UserInfo {
  id: string
  email: string
  displayName: string
  avatar?: string
}
