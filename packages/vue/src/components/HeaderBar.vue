<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { Star, Share2, Users, ChevronDown, MoreVertical, Check } from 'lucide-vue-next'
import type { Collaborator } from '../types.js'
import ThemeToggle from './ThemeToggle.vue'
import { useLocale, getSupportedLocales, getLocaleName } from '../composables/useLocale.js'

const { setLocale, t } = useLocale()

const supportedLocales = getSupportedLocales()

const props = withDefaults(
  defineProps<{
    title?: string
    editable?: boolean
    collaborators?: Collaborator[]
    starred?: boolean
    pageless?: boolean
    outlineOpen?: boolean
    showRuler?: boolean
    focusMode?: boolean
    currentUserId?: string
    simulatorsActive?: boolean
    userName?: string
    userAvatar?: string
  }>(),
  {
    title: 'Untitled Document',
    editable: true,
    collaborators: () => [],
    starred: false,
    pageless: false,
    outlineOpen: false,
    showRuler: true,
    focusMode: false,
    currentUserId: '',
    simulatorsActive: false,
    userName: '',
    userAvatar: '',
  },
)

const emit = defineEmits<{
  back: []
  'update:title': [title: string]
  'toggle-star': []
  'toggle-simulators': []
  export: [format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf']
  share: []
  'menu-click': [menu: string]
}>()

const isRenaming = ref(false)
const titleInput = ref(props.title)
const activeMenu = ref<string | null>(null)

watch(() => props.title, (next) => {
  titleInput.value = next
})

const handleSaveTitle = () => {
  const trimmed = titleInput.value.trim()
  if (trimmed && trimmed !== props.title) {
    emit('update:title', trimmed)
  }
  titleInput.value = props.title
  isRenaming.value = false
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const handleExport = (format: 'markdown' | 'html' | 'html-zip' | 'txt' | 'docx' | 'pdf' | 'odt' | 'rtf') => {
  emit('export', format)
  activeMenu.value = null
}

// `userAvatar` is treated as an image URL; initials are the fallback.
const currentUserInitials = computed(() => getInitials(props.userName) || '?')
const avatarError = ref(false)

// Menu structure
interface MenuItem {
  label: string
  action?: string
  divider?: boolean
  /** Keyboard shortcut hint displayed right-aligned (Google Docs style). */
  shortcut?: string
  /** Toggle items render a check gutter; true shows the check mark. */
  checked?: boolean
  sub?: { label: string; action: string; badge?: string }[]
}

const menus = computed<Record<string, { label: string; items: MenuItem[] }>>(() => ({
  File: {
    label: t('header.file'),
    items: [
      { label: t('header.new'), action: 'new-doc' },
      { label: t('header.open'), action: 'open-doc' },
      { label: t('header.makeACopy'), action: 'duplicate' },
      { label: 'divider', divider: true },
      { label: t('header.share'), action: 'share' },
      { label: t('header.email'), action: 'email' },
      {
        label: t('header.download'), sub: [
          { label: t('header.docx'), action: 'export:docx', badge: 'DOCX' },
          { label: t('header.pdf'), action: 'export:pdf', badge: 'PDF' },
          { label: t('header.odt'), action: 'export:odt', badge: 'ODT' },
          { label: t('header.txt'), action: 'export:txt', badge: 'TXT' },
          { label: t('header.rtf'), action: 'export:rtf', badge: 'RTF' },
          { label: t('header.htmlZip'), action: 'export:html-zip', badge: 'ZIP' },
          { label: t('header.html'), action: 'export:html', badge: 'HTML' },
          { label: t('header.markdown'), action: 'export:markdown', badge: 'MD' },
        ]
      },
      { label: 'divider', divider: true },
      { label: t('header.rename'), action: 'rename' },
      { label: t('header.move'), action: 'move' },
      { label: t('header.addToStarred'), action: 'add-to-starred' },
      { label: t('header.moveToTrash'), action: 'trash' },
      { label: 'divider', divider: true },
      { label: t('header.versionHistory'), action: 'version-history' },
      { label: 'divider', divider: true },
      { label: t('header.details'), action: 'details' },
      { label: t('header.security'), action: 'security' },
      { label: 'divider', divider: true },
      {
        label: t('header.language'), sub: supportedLocales.map((loc) => ({
          label: getLocaleName(loc),
          action: `set-locale:${loc}`,
        }))
      },
      { label: t('header.pageSetup'), action: 'page-setup' },
      { label: t('header.print'), action: 'print' },
    ],
  },
  Edit: {
    label: t('header.edit'),
    items: [
      { label: t('header.undo'), action: 'undo', shortcut: '⌘Z' },
      { label: t('header.redo'), action: 'redo', shortcut: '⌘Y' },
      { label: 'divider', divider: true },
      { label: t('header.cut'), action: 'cut', shortcut: '⌘X' },
      { label: t('header.copy'), action: 'copy', shortcut: '⌘C' },
      { label: t('header.paste'), action: 'paste', shortcut: '⌘V' },
      { label: t('header.pasteWithoutFormatting'), action: 'paste-without-formatting', shortcut: '⌘⇧V' },
      { label: 'divider', divider: true },
      { label: t('header.selectAll'), action: 'select-all', shortcut: '⌘A' },
      { label: t('header.delete'), action: 'delete' },
      { label: 'divider', divider: true },
      { label: t('header.findAndReplace'), action: 'find-replace', shortcut: '⌘⇧H' },
    ],
  },
  View: {
    label: t('header.view'),
    items: [
      { label: t('header.showSidebar'), action: 'toggle-left-sidebar', checked: props.outlineOpen },
      { label: 'divider', divider: true },
      { label: t('header.focusMode'), action: 'toggle-focus-mode', checked: props.focusMode },
      { label: t('header.showRuler'), action: 'toggle-ruler', checked: props.showRuler },
    ],
  },
  Insert: {
    label: t('header.insert'),
    items: [
      { label: t('header.meetingNotes'), action: 'meeting-notes' },
      { label: t('header.emailDraft'), action: 'email-draft' },
      { label: 'divider', divider: true },
      { label: t('header.image'), action: 'insert-image' },
      { label: t('header.table'), action: 'insert-table' },
      { label: t('header.codeBlock'), action: 'insert-code' },
      { label: 'divider', divider: true },
      { label: t('header.link'), action: 'insert-link', shortcut: '⌘K' },
      { label: 'divider', divider: true },
      { label: t('header.header'), action: 'insert-header' },
      { label: t('header.footer'), action: 'insert-footer' },
      { label: t('header.footnote'), action: 'insert-footnote' },
    ],
  },
  Format: {
    label: t('header.format'),
    items: [
      { label: t('header.bold'), action: 'bold' },
      { label: t('header.italic'), action: 'italic' },
      { label: t('header.underline'), action: 'underline' },
      { label: 'divider', divider: true },
      { label: t('header.heading1'), action: 'heading1' },
      { label: t('header.heading2'), action: 'heading2' },
      { label: t('header.heading3'), action: 'heading3' },
      { label: 'divider', divider: true },
      {
        label: t('header.alignIndent'), sub: [
          { label: t('header.alignLeft'), action: 'align-left' },
          { label: t('header.alignCenter'), action: 'align-center' },
          { label: t('header.alignRight'), action: 'align-right' },
          { label: t('header.alignJustify'), action: 'align-justify' },
        ]
      },
      {
        label: t('header.bulletsNumbering'), sub: [
          { label: t('header.bulletList'), action: 'bullet-list' },
          { label: t('header.numberedList'), action: 'numbered-list' },
          { label: t('header.taskList'), action: 'task-list' },
        ]
      },
      { label: 'divider', divider: true },
      { label: t('header.horizontalLine'), action: 'horizontal-line' },
      {
        label: t('header.pageNumbers'), sub: [
          { label: t('header.pageNumberInHeader'), action: 'page-numbers-header' },
          { label: t('header.pageNumberInFooter'), action: 'page-numbers-footer' },
        ]
      },
      { label: 'divider', divider: true },
      { label: t('header.pagelessFormat'), action: 'toggle-pageless', checked: props.pageless },
      { label: 'divider', divider: true },
      { label: t('header.clearFormatting'), action: 'clear-formatting' },
    ],
  },
  Tools: {
    label: t('header.tools'),
    items: [
      { label: t('header.spellCheck'), action: 'spellcheck' },
      { label: t('header.wordCount'), action: 'word-count' },
      { label: 'divider', divider: true },
      { label: t('header.preferences'), action: 'preferences' },
    ],
  },
  Extensions: {
    label: t('header.extensions'),
    items: [
      { label: t('header.manageExtensions'), action: 'manage-extensions' },
    ],
  },
  Help: {
    label: t('header.help'),
    items: [
      { label: t('header.keyboardShortcuts'), action: 'keyboard-shortcuts' },
      { label: 'divider', divider: true },
      { label: t('header.reportIssue'), action: 'report-issue' },
      { label: t('header.about'), action: 'about' },
    ],
  },
}))

const menuKeys = computed(() => Object.keys(menus.value))

// Sub-menu hover state
const hoveredSub = ref<string | null>(null)

const toggleMenu = (key: string) => {
  activeMenu.value = activeMenu.value === key ? null : key
  hoveredSub.value = null
}

// Overflow ('More') menu for secondary actions on small screens.
const moreOpen = ref(false)
const toggleMore = () => {
  moreOpen.value = !moreOpen.value
}

// Language menu
const languageOpen = ref(false)
const handleSetLocale = (next: 'en' | 'id') => {
  setLocale(next)
  languageOpen.value = false
}

// User/account menu (avatar + name → dropdown). Contents come from the host app
// via the #user-menu slot so the library stays auth-agnostic.
const userMenuOpen = ref(false)
const toggleUserMenu = () => {
  userMenuOpen.value = !userMenuOpen.value
}

const handleMenuAction = (action: string) => {
  if (action.startsWith('export:')) {
    const format = action.replace('export:', '') as 'markdown' | 'html' | 'txt'
    handleExport(format)
  } else if (action === 'share') {
    emit('share')
    activeMenu.value = null
  } else if (action === 'add-to-starred') {
    emit('toggle-star')
    activeMenu.value = null
  } else if (action === 'rename') {
    isRenaming.value = true
    activeMenu.value = null
  } else if (action.startsWith('set-locale:')) {
    const loc = action.replace('set-locale:', '') as 'en' | 'id'
    handleSetLocale(loc)
  } else {
    emit('menu-click', action)
  }
  hoveredSub.value = null
}

const closeMenus = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.header-menu-container')) {
    activeMenu.value = null
    hoveredSub.value = null
  }
  if (!target.closest('.header-more-container')) {
    moreOpen.value = false
  }
  if (!target.closest('.header-user-container')) {
    userMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', closeMenus, true))
onUnmounted(() => document.removeEventListener('click', closeMenus, true))
</script>

<template>
  <header class="sticky top-0 z-40 flex h-14 flex-col border-b border-slate-200 bg-white transition-colors duration-200 dark:border-slate-800 dark:bg-[#0b1120]">
    <div class="flex h-full w-full items-center justify-between gap-4 px-3 md:px-4">
      <!-- Left: logo + title + menu bar -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-base font-bold text-white shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:opacity-90 transition-opacity"
          :title="t('header.backToDocuments')"
          @click="emit('back')"
        >
          DF
        </button>

        <div class="flex min-w-0 flex-col gap-0.5">
          <!-- Title row -->
          <div class="flex items-center gap-1.5">
            <input
              v-if="isRenaming"
              v-model="titleInput"
              type="text"
              class="min-w-[150px] border-b-2 border-cyan-500 bg-transparent px-1 py-0 text-sm font-semibold text-slate-800 focus:outline-none dark:text-slate-100 md:min-w-[240px]"
              @blur="handleSaveTitle"
              @keydown.enter="handleSaveTitle"
            >
            <h1
              v-else
              class="max-w-[180px] cursor-text truncate rounded px-1 py-0 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60 md:max-w-[280px]"
              :title="t('header.clickToRename')"
              @click="isRenaming = true"
            >
              {{ props.title }}
            </h1>

            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-amber-500"
              :title="starred ? t('header.unstarDocument') : t('header.starDocument')"
              @click="emit('toggle-star')"
            >
              <Star class="h-4 w-4" :class="starred ? 'fill-amber-400 text-amber-500' : ''" />
            </button>
          </div>

          <!-- Menu bar under title -->
          <nav class="header-menu-container hidden items-center gap-0 md:flex">
            <div
              v-for="key in menuKeys"
              :key="key"
              class="relative"
            >
              <button
                type="button"
                class="flex items-center gap-0.5 rounded px-2 py-0.5 text-[13px] transition-colors"
                :class="activeMenu === key
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'"
                @click.stop="toggleMenu(key)"
              >
                {{ menus[key].label }}
              </button>

              <!-- Dropdown panel -->
              <Transition
                enter-active-class="transition-all duration-150 ease-out"
                enter-from-class="opacity-0 scale-95 translate-y-[-4px]"
                enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-active-class="transition-all duration-100 ease-in"
                leave-from-class="opacity-100 scale-100 translate-y-0"
                leave-to-class="opacity-0 scale-95 translate-y-[-4px]"
              >
                <div
                  v-if="activeMenu === key"
                  class="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
                  style="transform-origin: top left;"
                >
                  <template v-for="(item, idx) in menus[key].items" :key="idx">
                    <!-- Divider -->
                    <div v-if="item.divider" class="my-1 border-t border-slate-100 dark:border-slate-700/80" />

                    <!-- Sub-menu item -->
                    <div
                      v-else-if="item.sub"
                      class="relative"
                      @mouseenter="hoveredSub = `${key}-${idx}`"
                      @mouseleave="hoveredSub = null"
                    >
                      <button
                        type="button"
                        class="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                      >
                        <span>{{ item.label }}</span>
                        <ChevronDown class="h-3.5 w-3.5 -rotate-90 text-slate-400" />
                      </button>

                      <!-- Sub-panel -->
                      <Transition
                        enter-active-class="transition-all duration-100 ease-out"
                        enter-from-class="opacity-0 translate-x-2"
                        enter-to-class="opacity-100 translate-x-0"
                        leave-active-class="transition-all duration-75 ease-in"
                        leave-from-class="opacity-100 translate-x-0"
                        leave-to-class="opacity-0 translate-x-2"
                      >
                        <div
                          v-if="hoveredSub === `${key}-${idx}`"
                          class="absolute left-full top-0 z-50 ml-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
                        >
                          <button
                            v-for="sub in item.sub"
                            :key="sub.action"
                            type="button"
                            class="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                            @click.stop="handleMenuAction(sub.action)"
                          >
                            <span>{{ sub.label }}</span>
                            <span
                              v-if="sub.badge"
                              class="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-mono text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                            >
                              {{ sub.badge }}
                            </span>
                          </button>
                        </div>
                      </Transition>
                    </div>

                    <!-- Regular action item -->
                    <button
                      v-else
                      type="button"
                      class="flex w-full items-center justify-between gap-6 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                      @click.stop="handleMenuAction(item.action!)"
                    >
                      <span>{{ item.label }}</span>
                      <span
                        v-if="item.checked"
                        class="text-blue-600 dark:text-blue-400"
                      >
                        <Check class="h-3.5 w-3.5" />
                      </span>
                      <span
                        v-else-if="item.shortcut"
                        class="text-[11px] text-slate-400 dark:text-slate-500"
                      >
                        {{ item.shortcut }}
                      </span>
                    </button>
                  </template>
                </div>
              </Transition>
            </div>
          </nav>
        </div>
      </div>

      <!-- Right: actions. Primary (Comments, Share, avatar) always visible;
           secondary actions are inline on large screens and collapse into the
           "More" (⋮) menu on small screens. -->
      <div class="flex flex-shrink-0 items-center gap-1.5">
        <div v-if="collaborators.length > 0" class="hidden items-center gap-2 lg:flex">
          <div class="flex -space-x-1.5 overflow-hidden">
            <div
              v-for="c in collaborators"
              :key="c.userId"
              class="flex h-7 w-7 flex-shrink-0 cursor-help items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white dark:border-slate-900"
              :style="{ backgroundColor: c.color }"
              :title="`${c.name} ${c.userId === currentUserId ? '(You)' : ''} ${c.isTyping ? 'is typing...' : ''}`"
            >
              <span class="drop-shadow-sm">{{ getInitials(c.name) }}</span>
            </div>
          </div>
        </div>

        <slot name="actions" />

        <!-- Secondary actions — inline on large screens only -->
        <button
          v-if="editable"
          type="button"
          class="hidden h-8 w-8 items-center justify-center rounded-md transition-all xl:flex"
          :class="simulatorsActive
            ? 'animate-pulse bg-emerald-600 text-white hover:bg-emerald-700'
            : 'text-indigo-600 hover:bg-slate-100 dark:text-indigo-300 dark:hover:bg-slate-800'"
          :title="t('header.sandbox')"
          @click="emit('toggle-simulators')"
        >
          <Users class="h-[18px] w-[18px]" />
        </button>
        <div class="hidden xl:block">
          <ThemeToggle />
        </div>
        <!-- Share — always visible (primary) -->
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white shadow transition-colors hover:bg-blue-700"
          @click="emit('share')"
        >
          <Share2 class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">{{ t('header.share') }}</span>
        </button>

        <!-- User / account menu — avatar + name, dropdown for account actions -->
        <div class="header-user-container relative flex-shrink-0">
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            :title="userName"
            @click.stop="toggleUserMenu"
          >
            <img
              v-if="userAvatar && !avatarError"
              :src="userAvatar"
              :alt="userName"
              referrerpolicy="no-referrer"
              class="h-7 w-7 flex-shrink-0 rounded-full object-cover"
              @error="avatarError = true"
            >
            <span
              v-else
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white"
            >
              {{ currentUserInitials }}
            </span>
            <span class="hidden max-w-[140px] truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:inline">{{ userName || t('header.account') }}</span>
            <ChevronDown class="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          </button>

          <Transition
            enter-active-class="transition-all duration-150 ease-out"
            enter-from-class="opacity-0 scale-95 translate-y-[-4px]"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition-all duration-100 ease-in"
            leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 translate-y-[-4px]"
          >
            <div
              v-if="userMenuOpen"
              class="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
              style="transform-origin: top right;"
            >
              <div class="border-b border-slate-100 px-4 py-2 dark:border-slate-700/80">
                <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ userName || t('header.account') }}</p>
              </div>
              <slot name="user-menu" :close="() => (userMenuOpen = false)" />
            </div>
          </Transition>
        </div>

        <!-- Overflow "More" menu — shown until there's room for all actions inline -->
        <div class="header-more-container relative xl:hidden">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title="More"
            @click.stop="toggleMore"
          >
            <MoreVertical class="h-[18px] w-[18px]" />
          </button>

          <Transition
            enter-active-class="transition-all duration-150 ease-out"
            enter-from-class="opacity-0 scale-95 translate-y-[-4px]"
            enter-to-class="opacity-100 scale-100 translate-y-0"
            leave-active-class="transition-all duration-100 ease-in"
            leave-from-class="opacity-100 scale-100 translate-y-0"
            leave-to-class="opacity-0 scale-95 translate-y-[-4px]"
          >
            <div
              v-if="moreOpen"
              class="absolute right-0 top-full z-50 mt-1 min-w-[210px] rounded-lg border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-xl dark:border-slate-700 dark:bg-[#0e1525] dark:text-slate-200"
              style="transform-origin: top right;"
            >
              <!-- Host-app extras (e.g. Print, Logout) -->
              <slot name="overflow-actions" :close="() => (moreOpen = false)" />

              <button
                v-if="editable"
                type="button"
                class="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                @click="emit('toggle-simulators'); moreOpen = false"
              >
                <Users class="h-4 w-4 text-slate-400" />
                <span>{{ t('header.sandbox') }}</span>
              </button>
              <div class="my-1 border-t border-slate-100 dark:border-slate-700/80" />
              <div class="flex items-center justify-between px-4 py-2">
                <span>{{ t('header.theme') }}</span>
                <ThemeToggle />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </header>
</template>
