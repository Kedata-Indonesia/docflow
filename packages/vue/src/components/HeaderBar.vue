<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Star, Share2, Users, ChevronDown, MoreVertical, Check,
  PenLine, Eye,
} from 'lucide-vue-next'
import type { Collaborator } from '../types.js'
import type { DocumentMode } from '@kedata-indonesia/docflow-core'
import ThemeToggle from './ThemeToggle.vue'
import { buildMenus } from './menuStructure.js'
import { findHeaderBarAction, type ExportFormat, type HeaderBarActionHandlers } from './headerBarActions.js'
import { useLocale, getSupportedLocales, getLocaleName } from '../composables/useLocale.js'
import { useTheme } from '../composables/useTheme.js'
import logoWhite from '../assets/logo-white.png'
import logoColored from '../assets/logo-colored.png'

const { setLocale, t } = useLocale()
const { isDark } = useTheme()

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
    /** Document mode (#27/#28) — drives the View ▸ Document mode radios. */
    mode?: DocumentMode
    currentUserId?: string
    simulatorsActive?: boolean
    userName?: string
    userAvatar?: string
    /**
     * Actions this host does not implement (issue #153). They stay visible but
     * dimmed, carry `aria-disabled="true"` and show `reason` (or a localized
     * default) as the tooltip; clicking still emits, so the host can watch the
     * event fire in the log.
     */
    unimplementedActions?: Array<string | { action: string; reason?: string }>
    /** Enables Insert ▸ Bibliography (requires the citation plugin). */
    hasCitationPlugin?: boolean
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
    mode: 'editing',
    currentUserId: '',
    simulatorsActive: false,
    userName: '',
    userAvatar: '',
    unimplementedActions: () => [],
    hasCitationPlugin: false,
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
const titleInputEl = ref<HTMLInputElement | null>(null)
const activeMenu = ref<string | null>(null)
// Menu-bar navigation mode: once the user opens a top-level menu (via click),
// subsequent `mouseenter` events on neighboring menus switch the active menu
// without requiring a second click. Mirrors Google Docs / Word Web behavior.
// Exit conditions: clicking the active menu again, clicking outside the menu
// bar, pressing Escape, or dispatching the chosen menu action.
const menuNavActive = ref(false)

watch(() => props.title, (next) => {
  titleInput.value = next
})

const startRenaming = async () => {
  isRenaming.value = true
  await nextTick()
  titleInputEl.value?.focus()
  titleInputEl.value?.select()
}

const handleSaveTitle = () => {
  const trimmed = titleInput.value.trim()
  if (trimmed && trimmed !== props.title) {
    emit('update:title', trimmed)
  }
  titleInput.value = props.title
  isRenaming.value = false
}

const editorLogoSrc = computed(() => isDark.value ? logoWhite : logoColored)

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const handleExport = (format: ExportFormat) => {
  emit('export', format)
  activeMenu.value = null
}

// `userAvatar` is treated as an image URL; initials are the fallback.
const currentUserInitials = computed(() => getInitials(props.userName) || '?')
const avatarError = ref(false)

// Platform detection — used to show OS-appropriate shortcut hints (⌘ on Mac, Ctrl+ elsewhere).
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

const menus = computed(() => buildMenus({
  t,
  isMac,
  outlineOpen: !!props.outlineOpen,
  focusMode: !!props.focusMode,
  showRuler: !!props.showRuler,
  mode: props.mode ?? 'editing',
  pageless: !!props.pageless,
  supportedLocales,
  getLocaleName,
  hasCitationPlugin: !!props.hasCitationPlugin,
}))

const menuKeys = computed(() => Object.keys(menus.value))

// ─── Host-owned menu items (issue #153) ──────────────────────────────────────
// The host tells us which actions it does not implement. Such items stay
// visible — dimmed, annotated and still clickable — instead of being hidden,
// because the click must keep emitting (the playground's event log is the
// point). One lookup, one set of render helpers.
const unimplementedLookup = computed(() => {
  const lookup = new Map<string, string | undefined>()
  for (const entry of props.unimplementedActions) {
    if (typeof entry === 'string') lookup.set(entry, undefined)
    else lookup.set(entry.action, entry.reason)
  }
  return lookup
})

/** `true` when the host flagged this action as one it does not implement. */
const isUnimplemented = (action?: string): boolean =>
  !!action && unimplementedLookup.value.has(action)

/** Tooltip for a flagged action: the host's reason, else the localized default. */
const unimplementedHint = (action?: string): string | undefined => {
  if (!action || !isUnimplemented(action)) return undefined
  return unimplementedLookup.value.get(action) || t('header.hostOwnedHint')
}

/** Flagged items are dimmed and lose the hover fill but stay focusable. */
const menuItemClass = (action?: string): string[] => [
  'flex w-full items-center justify-between gap-6 px-4 py-2 text-left',
  isUnimplemented(action) ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-white/5',
]

// Sub-menu hover state
const hoveredSub = ref<string | null>(null)

const toggleMenu = (key: string) => {
  const opening = activeMenu.value !== key
  activeMenu.value = opening ? key : null
  hoveredSub.value = null
  menuNavActive.value = opening
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

// The dispatcher and the host/library classification share ONE table
// (`HEADER_BAR_ACTIONS` in components/headerBarActions.ts) so they cannot
// drift: `host: false` entries are resolved in-library (set-locale:*), the
// `host: true` ones only fire an event for the host to implement.
const headerBarHandlers: HeaderBarActionHandlers = {
  exportDocument: (format) => handleExport(format),
  share: () => {
    emit('share')
  },
  toggleStar: () => {
    emit('toggle-star')
  },
  rename: () => {
    void startRenaming()
  },
  setLocale: (locale) => handleSetLocale(locale),
}

const handleMenuAction = (action: string) => {
  const entry = findHeaderBarAction(action)
  if (entry) {
    entry.run(action, headerBarHandlers)
  } else {
    emit('menu-click', action)
  }
  // Every action closes the dropdown. Menu items use @click.stop, so the
  // document-level closeMenus() listener deliberately ignores clicks inside
  // `.header-menu-container`; without this, dialogs (e.g. Details) leave the
  // menu open behind the modal.
  activeMenu.value = null
  hoveredSub.value = null
  menuNavActive.value = false
}

const closeMenus = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.header-menu-container')) {
    activeMenu.value = null
    hoveredSub.value = null
    menuNavActive.value = false
  }
  if (!target.closest('.header-more-container')) {
    moreOpen.value = false
  }
  if (!target.closest('.header-user-container')) {
    userMenuOpen.value = false
  }
}

function onMenuBarMouseEnter(key: string) {
  if (!menuNavActive.value) return
  if (activeMenu.value === key) return
  activeMenu.value = key
  hoveredSub.value = null
}

function handleMenuKeydown(e: KeyboardEvent) {
  if (!activeMenu.value) return
  if (e.key === 'Escape') {
    activeMenu.value = null
    hoveredSub.value = null
    menuNavActive.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeMenus, true)
  document.addEventListener('keydown', handleMenuKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', closeMenus, true)
  document.removeEventListener('keydown', handleMenuKeydown)
})
</script>

<template>
  <header class="sticky top-0 z-40 flex h-14 flex-col border-b border-slate-200 bg-white transition-colors duration-200 dark:border-slate-800 dark:bg-[#0b1120]">
    <div class="flex h-full w-full items-center justify-between gap-4 px-3 md:px-4">
      <!-- Left: logo + title + menu bar -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex h-9 cursor-pointer items-center justify-center hover:opacity-90 transition-opacity"
          :title="t('header.backToDocuments')"
          :aria-label="t('header.backToDocuments')"
          @click="emit('back')"
        >
          <img
            :src="editorLogoSrc"
            alt="Docflow"
            class="h-9 w-auto"
          >
        </button>

        <div class="flex min-w-0 flex-col gap-0.5">
          <!-- Title row -->
          <div class="flex items-center gap-1.5">
            <input
              v-if="isRenaming"
              ref="titleInputEl"
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
              @click="void startRenaming()"
            >
              {{ props.title }}
            </h1>

            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-amber-500"
              :title="starred ? t('header.unstarDocument') : t('header.starDocument')"
              :aria-label="starred ? t('header.unstarDocument') : t('header.starDocument')"
              @click="emit('toggle-star')"
            >
              <Star class="h-4 w-4" :class="starred ? 'fill-amber-400 text-amber-500' : ''" />
            </button>

            <!-- Document-mode indicator (#27/#28) — makes suggesting/viewing obvious -->
            <span
              v-if="props.mode === 'suggesting'"
              class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
              :title="t('header.modeSuggesting')"
            >
              <PenLine class="h-3 w-3" />
              {{ t('header.modeSuggesting') }}
            </span>
            <span
              v-else-if="props.mode === 'viewing'"
              class="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-400/15 dark:text-slate-300"
              :title="t('header.modeViewing')"
            >
              <Eye class="h-3 w-3" />
              {{ t('header.modeViewing') }}
            </span>
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
                @mouseenter="onMenuBarMouseEnter(key)"
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
                  data-testid="header-menu-panel"
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
                        class="flex w-full items-center justify-between gap-6 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                      >
                        <span class="flex items-center gap-2.5">
                          <component
                            :is="item.icon"
                            v-if="item.icon"
                            class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                          />
                          {{ item.label }}
                        </span>
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
                            :class="menuItemClass(sub.action)"
                            :title="unimplementedHint(sub.action)"
                            :aria-disabled="isUnimplemented(sub.action) ? 'true' : undefined"
                            @click.stop="handleMenuAction(sub.action)"
                          >
                            <span class="flex items-center gap-2.5">
                              <component
                                :is="sub.icon"
                                v-if="sub.icon"
                                class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                              />
                              {{ sub.label }}
                              <!-- Host-owned marker (#153): never colour-only. -->
                              <span
                                v-if="isUnimplemented(sub.action)"
                                class="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-mono text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                              >
                                {{ t('header.hostOwned') }}
                              </span>
                            </span>
                            <span
                              v-if="sub.badge"
                              class="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-mono text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                            >
                              {{ sub.badge }}
                            </span>
                            <span
                              v-else-if="sub.shortcut"
                              class="text-[11px] text-slate-400 dark:text-slate-500"
                            >
                              {{ sub.shortcut }}
                            </span>
                          </button>
                        </div>
                      </Transition>
                    </div>

                    <!-- Regular action item -->
                    <button
                      v-else
                      type="button"
                      :class="menuItemClass(item.action)"
                      :title="unimplementedHint(item.action)"
                      :aria-disabled="isUnimplemented(item.action) ? 'true' : undefined"
                      @click.stop="handleMenuAction(item.action!)"
                    >
                      <span class="flex items-center gap-2.5">
                        <component
                          :is="item.icon"
                          v-if="item.icon"
                          class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                        />
                        {{ item.label }}
                        <!-- Host-owned marker (#153): never colour-only. -->
                        <span
                          v-if="isUnimplemented(item.action)"
                          class="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-mono text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                        >
                          {{ t('header.hostOwned') }}
                        </span>
                      </span>
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
          :aria-label="t('header.sandbox')"
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
            :title="t('a11y.more')"
            :aria-label="t('a11y.more')"
            aria-haspopup="menu"
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
