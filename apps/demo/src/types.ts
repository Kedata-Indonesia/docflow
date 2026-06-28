export interface DocumentItem {
  id: string
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
