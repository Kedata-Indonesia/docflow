import { Node, mergeAttributes } from '@tiptap/core'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

/**
 * Smart Elements — Google-Docs-style interactive inline chips.
 *
 * Each chip is an inline {@link atom} node (`group: 'inline'`, `inline: true`,
 * `atom: true`) rendered through {@link addNodeView} so the host editor never
 * stores display text — only the canonical attributes. This mirrors the
 * existing footnote/citation node pattern and keeps copy-paste, export, and
 * collaboration (Yjs) working off a small JSON-serialisable attribute payload.
 *
 * Five chip kinds ship here per issue #148:
 *   1. {@link DateChipNode}     — date pill; click opens a native date picker.
 *   2. {@link PeopleChipNode}   — @mention pill with an avatar initial.
 *   3. {@link FileChipNode}    — workspace-file link pill.
 *   4. {@link DropdownChipNode} — status dropdown (To Do / In Progress / …).
 *   5. {@link LocationChipNode} — place/map pill.
 *
 * The People/File/Location chips use the same `window.prompt` fallback as the
 * link extension for the v1 insert flow; a host can later inject a picker port
 * (see docs/LIBRARY_CONTRACT.md §4) without changing the node schema.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  if (!iso) return 'Pick a date'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return 'Pick a date'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function initialOf(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?'
}

const DEFAULT_STATUSES = ['To Do', 'In Progress', 'Review', 'Approved']

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ─── Date Chip ────────────────────────────────────────────────────────────

export const DateChipNode = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      date: {
        default: todayISO(),
        parseHTML: (el: HTMLElement) => el.getAttribute('data-date') ?? todayISO(),
        renderHTML: (attrs: Record<string, any>) => ({ 'data-date': attrs.date ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="date-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'date-chip',
      class: 'docs-chip docs-chip--date',
    }), formatDate(node.attrs.date)]
  },

  addNodeView(): any {
    return (props: any) => {
      let currentNode = props.node
      const getPos = props.getPos as () => number | undefined
      const view = props.view

      const dom = document.createElement('span')
      dom.className = 'docs-chip docs-chip--date'
      dom.setAttribute('data-node-type', 'date-chip')
      dom.setAttribute('contenteditable', 'false')

      const render = () => {
        if (dom.querySelector('input')) return
        dom.textContent = formatDate(currentNode.attrs.date)
        dom.setAttribute('data-date', currentNode.attrs.date)
      }
      render()

      dom.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (dom.querySelector('input')) return
        const input = document.createElement('input')
        input.type = 'date'
        input.value = currentNode.attrs.date
        input.className = 'docs-chip-date-input'
        dom.replaceChildren(input)
        input.focus()
        const commit = () => {
          const newVal = input.value
          const pos = getPos()
          if (typeof pos === 'number') {
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { date: newVal }))
          }
          setTimeout(render, 30)
        }
        input.addEventListener('change', commit)
        input.addEventListener('blur', () => setTimeout(render, 30))
      })

      return {
        dom,
        update(updatedNode: any): boolean {
          if (updatedNode.type.name !== 'dateChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})

// ─── People Chip ──────────────────────────────────────────────────────────

export const PeopleChipNode = Node.create({
  name: 'peopleChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      userId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-user-id') ?? '',
        renderHTML: (attrs: Record<string, any>) => (attrs.userId ? { 'data-user-id': attrs.userId } : {}),
      },
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-name') ?? '',
        renderHTML: (attrs: Record<string, any>) => ({ 'data-name': attrs.name ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="people-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'people-chip',
      class: 'docs-chip docs-chip--people',
    }), `@${node.attrs.name || 'user'}`]
  },

  addNodeView(): any {
    return (props: any) => {
      let currentNode = props.node
      const dom = document.createElement('span')
      dom.className = 'docs-chip docs-chip--people'
      dom.setAttribute('data-node-type', 'people-chip')
      dom.setAttribute('contenteditable', 'false')

      const render = () => {
        const name = currentNode.attrs.name || 'user'
        dom.innerHTML = ''
        const avatar = document.createElement('span')
        avatar.className = 'docs-chip-avatar'
        avatar.textContent = initialOf(name)
        dom.appendChild(avatar)
        const label = document.createElement('span')
        label.className = 'docs-chip-label'
        label.textContent = '@' + name
        dom.appendChild(label)
      }
      render()

      return {
        dom,
        update(updatedNode: any): boolean {
          if (updatedNode.type.name !== 'peopleChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})

// ─── File Chip ───────────────────────────────────────────────────────────

export const FileChipNode = Node.create({
  name: 'fileChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      fileId: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-file-id') ?? '',
        renderHTML: (attrs: Record<string, any>) => (attrs.fileId ? { 'data-file-id': attrs.fileId } : {}),
      },
      name: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-name') ?? '',
        renderHTML: (attrs: Record<string, any>) => ({ 'data-name': attrs.name ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="file-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'file-chip',
      class: 'docs-chip docs-chip--file',
    }), node.attrs.name || 'file']
  },

  addNodeView(): any {
    return (props: any) => {
      let currentNode = props.node
      const dom = document.createElement('span')
      dom.className = 'docs-chip docs-chip--file'
      dom.setAttribute('data-node-type', 'file-chip')
      dom.setAttribute('contenteditable', 'false')

      const render = () => {
        const name = currentNode.attrs.name || 'Untitled file'
        dom.innerHTML = ''
        const icon = document.createElement('span')
        icon.className = 'docs-chip-icon'
        icon.textContent = '🗎'
        dom.appendChild(icon)
        const label = document.createElement('span')
        label.className = 'docs-chip-label'
        label.textContent = name
        dom.appendChild(label)
      }
      render()

      return {
        dom,
        update(updatedNode: any): boolean {
          if (updatedNode.type.name !== 'fileChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})

// ─── Dropdown Chip ────────────────────────────────────────────────────────

export const DropdownChipNode = Node.create({
  name: 'dropdownChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      options: {
        default: DEFAULT_STATUSES,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-options') ?? ''
          const list = raw ? raw.split('|') : []
          return list.length ? list : DEFAULT_STATUSES
        },
        renderHTML: (attrs: Record<string, any>) => ({
          'data-options': (attrs.options ?? []).join('|'),
        }),
      },
      selected: {
        default: DEFAULT_STATUSES[0],
        parseHTML: (el: HTMLElement) => el.getAttribute('data-selected') ?? DEFAULT_STATUSES[0],
        renderHTML: (attrs: Record<string, any>) => ({ 'data-selected': attrs.selected ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="dropdown-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'dropdown-chip',
      class: 'docs-chip docs-chip--dropdown',
    }), node.attrs.selected || '']
  },

  addNodeView(): any {
    return (props: any) => {
      let currentNode = props.node
      const getPos = props.getPos as () => number | undefined
      const view = props.view

      const dom = document.createElement('span')
      dom.className = 'docs-chip docs-chip--dropdown'
      dom.setAttribute('data-node-type', 'dropdown-chip')
      dom.setAttribute('contenteditable', 'false')

      const render = () => {
        const opts: string[] = currentNode.attrs.options ?? DEFAULT_STATUSES
        const sel: string = currentNode.attrs.selected ?? (opts[0] ?? '')
        dom.innerHTML = ''
        const select = document.createElement('select')
        select.className = 'docs-chip-select'
        // Stop ProseMirror from treating the click as a node-selection drag.
        select.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation())
        for (const opt of opts) {
          const o = document.createElement('option')
          o.value = opt
          o.textContent = opt
          if (opt === sel) o.selected = true
          select.appendChild(o)
        }
        select.addEventListener('change', () => {
          const pos = getPos()
          if (typeof pos === 'number') {
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              selected: select.value,
            }))
          }
        })
        dom.appendChild(select)
      }
      render()

      return {
        dom,
        update(updatedNode: any): boolean {
          if (updatedNode.type.name !== 'dropdownChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})

// ─── Location Chip ────────────────────────────────────────────────────────

export const LocationChipNode = Node.create({
  name: 'locationChip',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: false,
  atom: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-label') ?? '',
        renderHTML: (attrs: Record<string, any>) => ({ 'data-label': attrs.label ?? '' }),
      },
      lat: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-lat')
          return v === null ? null : Number(v)
        },
        renderHTML: (attrs: Record<string, any>) => (attrs.lat != null ? { 'data-lat': attrs.lat } : {}),
      },
      lng: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-lng')
          return v === null ? null : Number(v)
        },
        renderHTML: (attrs: Record<string, any>) => (attrs.lng != null ? { 'data-lng': attrs.lng } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-node-type="location-chip"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-node-type': 'location-chip',
      class: 'docs-chip docs-chip--location',
    }), node.attrs.label || '']
  },

  addNodeView(): any {
    return (props: any) => {
      let currentNode = props.node
      const dom = document.createElement('span')
      dom.className = 'docs-chip docs-chip--location'
      dom.setAttribute('data-node-type', 'location-chip')
      dom.setAttribute('contenteditable', 'false')

      const render = () => {
        const label = currentNode.attrs.label || 'Add location'
        dom.innerHTML = ''
        const icon = document.createElement('span')
        icon.className = 'docs-chip-icon'
        icon.textContent = '📍'
        dom.appendChild(icon)
        const lbl = document.createElement('span')
        lbl.className = 'docs-chip-label'
        lbl.textContent = label
        dom.appendChild(lbl)
      }
      render()

      return {
        dom,
        update(updatedNode: any): boolean {
          if (updatedNode.type.name !== 'locationChip') return false
          currentNode = updatedNode
          render()
          return true
        },
      }
    }
  },
})

// ─── Plugin ──────────────────────────────────────────────────────────────

export const smartElementsPlugin = definePlugin({
  id: 'smart-elements',
  tiptapExtensions: [
    DateChipNode,
    PeopleChipNode,
    FileChipNode,
    DropdownChipNode,
    LocationChipNode,
  ],
  slashCommands: [
    { name: 'Date', command: 'insertDateChip' },
    { name: 'People', command: 'insertPeopleChip' },
    { name: 'File', command: 'insertFileChip' },
    { name: 'Dropdown', command: 'insertDropdownChip' },
    { name: 'Location', command: 'insertLocationChip' },
  ],
  commands: {
    insertDateChip: (editor: Editor) => {
      return editor.chain().focus().insertContent({
        type: 'dateChip',
        attrs: { date: todayISO() },
      }).run()
    },
    insertPeopleChip: (editor: Editor) => {
      const name = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? (window.prompt('Enter user name:', '') ?? '')
        : ''
      if (!name.trim()) return false
      const trimmed = name.trim()
      return editor.chain().focus().insertContent({
        type: 'peopleChip',
        attrs: { userId: slugify(trimmed), name: trimmed },
      }).run()
    },
    insertFileChip: (editor: Editor) => {
      const name = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? (window.prompt('Enter file/document name:', '') ?? '')
        : ''
      if (!name.trim()) return false
      const trimmed = name.trim()
      return editor.chain().focus().insertContent({
        type: 'fileChip',
        attrs: { fileId: slugify(trimmed), name: trimmed },
      }).run()
    },
    insertDropdownChip: (editor: Editor) => {
      return editor.chain().focus().insertContent({
        type: 'dropdownChip',
        attrs: { options: DEFAULT_STATUSES, selected: DEFAULT_STATUSES[0] },
      }).run()
    },
    insertLocationChip: (editor: Editor) => {
      const label = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? (window.prompt('Enter location name:', '') ?? '')
        : ''
      if (!label.trim()) return false
      return editor.chain().focus().insertContent({
        type: 'locationChip',
        attrs: { label: label.trim() },
      }).run()
    },
  },
})