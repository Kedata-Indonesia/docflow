import { Mark, mergeAttributes } from '@tiptap/core'
import { SUGGESTION_DELETE, SUGGESTION_FORMAT, SUGGESTION_INSERT } from './suggestTypes.js'

const suggestionAttributes = () => ({
  suggestionId: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion-id'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.suggestionId ? { 'data-suggestion-id': attrs.suggestionId } : {},
  },
  authorId: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion-author'),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.authorId ? { 'data-suggestion-author': attrs.authorId } : {},
  },
  authorName: { default: null },
  createdAt: { default: null },
})

/** Text that would be added. */
export const SuggestionInsertMark = Mark.create({
  name: SUGGESTION_INSERT,
  addAttributes() {
    return suggestionAttributes()
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="insert"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-suggestion': 'insert',
        class: 'docflow-suggestion docflow-suggestion--insert',
      }),
      0,
    ]
  },
})

/** Text that would be removed. */
export const SuggestionDeleteMark = Mark.create({
  name: SUGGESTION_DELETE,
  addAttributes() {
    return suggestionAttributes()
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="delete"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-suggestion': 'delete',
        class: 'docflow-suggestion docflow-suggestion--delete',
      }),
      0,
    ]
  },
})

/** A proposed inline-format change (P3): the mark is recorded, not applied. */
export const SuggestionFormatMark = Mark.create({
  name: SUGGESTION_FORMAT,
  addAttributes() {
    return {
      ...suggestionAttributes(),
      format: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-suggestion-format'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.format ? { 'data-suggestion-format': attrs.format } : {},
      },
      delta: { default: 'add' },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-suggestion="format"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-suggestion': 'format',
        class: 'docflow-suggestion docflow-suggestion--format',
      }),
      0,
    ]
  },
})
