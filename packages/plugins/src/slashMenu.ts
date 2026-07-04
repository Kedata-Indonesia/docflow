import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import { definePlugin } from '@kedata-indonesia/docflow-core'
import type { Editor } from '@tiptap/core'

// ─── Slash Menu State ─────────────────────────────────────────────────────

interface SlashState {
  open: boolean
  query: string
  position: { top: number; left: number }
  commands: Array<{ name: string; command: string; action: (() => boolean) | null }>
  selectedIndex: number
}

// Global state (shared between extension DOM and React/Vue)
export let slashState: SlashState = {
  open: false,
  query: '',
  position: { top: 0, left: 0 },
  commands: [],
  selectedIndex: 0,
}

let listeners: Array<() => void> = []

export function onSlashStateChange(fn: () => void) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function notifyListeners() {
  listeners.forEach(fn => fn())
}

function closeSlashMenu() {
  slashState = { ...slashState, open: false, query: '' }
  notifyListeners()
}

function openSlashMenu(view: EditorView, query: string) {
  const { doc, selection } = view.state
  const pos = selection.head
  const coords = view.coordsAtPos(pos)

  // Collect all slash commands from extensions
  const commands: SlashState['commands'] = []
  view.state.doc.descendants(() => {
    // Commands come from extensions
  })

  // Build command list from registered slash commands
  const allCommands = getRegisteredCommands(view)
  const filtered = query
    ? allCommands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : allCommands

  slashState = {
    open: true,
    query,
    position: { top: coords.bottom + 4, left: coords.left },
    commands: filtered.map(c => ({ ...c, action: null })),
    selectedIndex: 0,
  }
  notifyListeners()
}

// ─── Slash Command Registry ────────────────────────────────────────────────

const registeredCommands: Map<string, Array<{ name: string; command: string }>> = new Map()

export function registerSlashCommands(editorId: string, commands: Array<{ name: string; command: string }>) {
  const existing = registeredCommands.get(editorId) || []
  registeredCommands.set(editorId, [...existing, ...commands])
}

function getRegisteredCommands(view: EditorView): Array<{ name: string; command: string }> {
  const all: Array<{ name: string; command: string }> = []
  registeredCommands.forEach(cmds => {
    all.push(...cmds)
  })
  // Deduplicate by name
  const seen = new Set<string>()
  return all.filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })
}

// ─── TipTap Extension ─────────────────────────────────────────────────────

export const SlashMenuExtension = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('slashMenu'),
        props: {
          handleTextInput(view, from, to, text) {
            // Detect '/' typed at start of line or after space
            if (text === '/') {
              const $pos = view.state.doc.resolve(from)
              const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset)
              if (textBefore === '' || textBefore.endsWith(' ')) {
                setTimeout(() => openSlashMenu(view, ''), 10)
                return false // allow the '/' to be inserted
              }
            }
            // If menu is open, filter by typing
            if (slashState.open && text.length === 1 && /[a-zA-Z]/.test(text)) {
              const newQuery = slashState.query + text
              openSlashMenu(view, newQuery)
              return false
            }
            return false
          },
          handleKeyDown(view, event) {
            if (!slashState.open) return false

            if (event.key === 'ArrowDown') {
              event.preventDefault()
              slashState.selectedIndex = Math.min(slashState.selectedIndex + 1, slashState.commands.length - 1)
              notifyListeners()
              return true
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              slashState.selectedIndex = Math.max(slashState.selectedIndex - 1, 0)
              notifyListeners()
              return true
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              const cmd = slashState.commands[slashState.selectedIndex]
              if (cmd) {
                // Delete the '/' query text, then execute command
                const $pos = view.state.doc.resolve(view.state.selection.head)
                const lineStart = $pos.start()
                const slashPos = lineStart + ($pos.parent.textContent.lastIndexOf('/'))
                if (slashPos >= lineStart) {
                  const tr = view.state.tr.delete(slashPos, view.state.selection.head)
                  view.dispatch(tr)
                }
                // Execute the command via TipTap
                const editor = (view as unknown as { _tiptapEditor?: Editor })._tiptapEditor
                if (editor) {
                  const actionMap = (editor as unknown as Record<string, () => boolean>)
                  if (typeof actionMap[cmd.command] === 'function') {
                    actionMap[cmd.command]()
                  }
                }
              }
              closeSlashMenu()
              return true
            }
            if (event.key === 'Escape') {
              closeSlashMenu()
              return true
            }
            if (event.key === 'Backspace') {
              if (slashState.query.length > 0) {
                const newQuery = slashState.query.slice(0, -1)
                if (newQuery) {
                  openSlashMenu(view, newQuery)
                } else {
                  openSlashMenu(view, '')
                }
                return false
              } else {
                // Delete the '/'
                const $pos = view.state.doc.resolve(view.state.selection.head)
                const lineStart = $pos.start()
                const slashPos = $pos.parent.textContent.lastIndexOf('/')
                if (slashPos >= 0) {
                  const tr = view.state.tr.delete(lineStart + slashPos, view.state.selection.head)
                  view.dispatch(tr)
                }
                closeSlashMenu()
                return true
              }
            }
            return false
          },
        },
      }),
    ]
  },
})

// ─── Plugin Definition ────────────────────────────────────────────────────

export const slashMenuPlugin = definePlugin({
  id: 'slash-menu',
  tiptapExtensions: [SlashMenuExtension],
  hooks: {
    onInit(editor) {
      // Collect slash commands from all registered plugins
      const commands: Array<{ name: string; command: string }> = []
      // Commands come from plugins' slashCommands definitions
      registerSlashCommands('default', commands)
    },
  },
})
