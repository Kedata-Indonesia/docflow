import type { Collaborator, CommentItem, DocumentSnapshot } from '@kedata-indonesia/docflow-vue'

/**
 * Host-owned side data: the comment threads, version snapshots and
 * collaborators a real consumer would supply. The library only renders them and
 * emits the intents (add / resolve / delete / restore).
 */

export const SAMPLE_COMMENTS: CommentItem[] = [
  {
    id: 'thread-1',
    authorId: 'user-2',
    authorName: 'Dimas Prasetyo',
    authorColor: '#2563eb',
    content: 'The reference number needs to match this year\u2019s agenda book.',
    anchorText: 'Reference: 214/NC/X/2026',
    createdAt: Date.now() - 7_200_000,
    replies: [
      {
        id: 'reply-1',
        authorId: 'user-1',
        authorName: 'Reviewer DocFlow',
        authorColor: '#059669',
        content: 'Checked with the secretariat — this number is correct.',
        createdAt: Date.now() - 3_600_000,
      },
    ],
  },
  {
    id: 'thread-2',
    authorId: 'user-3',
    authorName: 'Sari Indah',
    authorColor: '#d97706',
    content: 'Add the online link so out-of-town participants can join.',
    createdAt: Date.now() - 86_400_000,
    resolved: true,
    resolvedBy: 'Dimas Prasetyo',
    replies: [],
  },
  {
    id: 'thread-3',
    authorId: 'user-1',
    authorName: 'Reviewer DocFlow',
    authorColor: '#059669',
    content: 'The deadline for submitting presentation materials should be emphasized in a separate bullet.',
    createdAt: Date.now() - 172_800_000,
    replies: [],
  },
]

export const SAMPLE_SNAPSHOTS: DocumentSnapshot[] = [
  {
    versionId: 'ver-3',
    versionIndex: 3,
    title: 'Final revision — ready for signature',
    contentPreview: 'This agreement is made and signed on Wednesday, 7 October 2026…',
    modifiedBy: 'Reviewer DocFlow',
    timestamp: Date.now() - 1_800_000,
  },
  {
    versionId: 'ver-2',
    versionIndex: 2,
    title: 'Revision of Article 3',
    contentPreview: 'The contract value is agreed at IDR 1,480,000,000, excluding taxes…',
    modifiedBy: 'Dimas Prasetyo',
    timestamp: Date.now() - 43_200_000,
  },
  {
    versionId: 'ver-1',
    versionIndex: 1,
    title: 'First draft',
    contentPreview: 'The SECOND PARTY shall provide development, maintenance, and support…',
    modifiedBy: 'Sari Indah',
    timestamp: Date.now() - 259_200_000,
  },
]

export const SAMPLE_COLLABORATORS: Collaborator[] = [
  { userId: 'user-2', name: 'Dimas Prasetyo', color: '#2563eb' },
  { userId: 'user-3', name: 'Sari Indah', color: '#d97706', isTyping: true },
  { userId: 'user-4', name: 'Bagas Wicaksana', color: '#7c3aed' },
]
