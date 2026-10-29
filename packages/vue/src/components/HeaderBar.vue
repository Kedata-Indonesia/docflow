<script setup lang="ts">
import { computed } from 'vue'
import { Share2, Users } from 'lucide-vue-next'
import type { Collaborator } from '../types.js'
import type { DocumentMode } from '@kedata-indonesia/docflow-core'
import ThemeToggle from './ThemeToggle.vue'
import { buildMenus } from './menuStructure.js'
import {
  findHeaderBarAction,
  type ExportFormat,
  type HeaderBarActionHandlers,
} from './headerBarActions.js'
import { useLocale, getSupportedLocales, getLocaleName } from '../composables/useLocale.js'
import { useTheme } from '../composables/useTheme.js'
import CollaboratorStack from './header/CollaboratorStack.vue'
import HeaderMenuBar from './header/HeaderMenuBar.vue'
import HeaderMoreMenu from './header/HeaderMoreMenu.vue'
import HeaderTitle from './header/HeaderTitle.vue'
import HeaderUserMenu from './header/HeaderUserMenu.vue'
import { buildUnimplementedMap } from './header/unimplemented.js'
import logoWhite from '../assets/logo-white.png'
import logoColored from '../assets/logo-colored.png'

/**
 * Editor header bar: back-to-documents, title, menu bar, collaborator stack and
 * the account/overflow menus.
 *
 * The pieces are split so each dropdown owns its own open/close state and
 * outside-click listener: `header/HeaderTitle.vue` (rename + star + mode badge),
 * `header/HeaderMenuBar.vue` (+ `HeaderMenuPanel.vue`), `header/
 * CollaboratorStack.vue`, `header/HeaderUserMenu.vue` and
 * `header/HeaderMoreMenu.vue`. This file stays the composition root: props,
 * emits, the menu tree and the action dispatcher.
 */

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

const editorLogoSrc = computed(() => (isDark.value ? logoWhite : logoColored))

function handleExport(format: ExportFormat): void {
  emit('export', format)
}

// Platform detection — used to show OS-appropriate shortcut hints (⌘ on Mac,
// Ctrl+ elsewhere).
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

const menus = computed(() =>
  buildMenus({
    t,
    isMac,
    outlineOpen: !!props.outlineOpen,
    focusMode: !!props.focusMode,
    showRuler: !!props.showRuler,
    mode: props.mode,
    pageless: !!props.pageless,
    supportedLocales,
    getLocaleName,
    hasCitationPlugin: !!props.hasCitationPlugin,
  }),
)

/** Host-owned actions (issue #153) — see `header/unimplemented.ts`. */
const unimplemented = computed(() => buildUnimplementedMap(props.unimplementedActions))

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
    // Renaming is owned by `HeaderTitle`; a menu click on "Rename" focuses the
    // title input through the same click handler the title itself uses.
    document.querySelector<HTMLElement>('[data-header-title] h1')?.click()
  },
  setLocale: (locale) => setLocale(locale),
}

function handleMenuAction(action: string): void {
  const entry = findHeaderBarAction(action)
  if (entry) {
    entry.run(action, headerBarHandlers)
  } else {
    emit('menu-click', action)
  }
  // Closing is handled by the menu bar itself; keep this comment as the
  // contract: every action closes the dropdown (menu items use @click.stop, and
  // without closing, dialogs such as Details would sit behind an open menu).
}
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

        <div class="flex min-w-0 flex-col gap-0.5" data-header-title>
          <HeaderTitle
            :title="props.title"
            :starred="props.starred"
            :mode="props.mode"
            @update:title="(next) => emit('update:title', next)"
            @toggle-star="emit('toggle-star')"
          />

          <!-- Menu bar under title -->
          <HeaderMenuBar
            :menus="menus"
            :unimplemented="unimplemented"
            @select="handleMenuAction"
          />
        </div>
      </div>

      <!-- Right: actions. Primary (Comments, Share, avatar) always visible;
           secondary actions are inline on large screens and collapse into the
           "More" (⋮) menu on small screens. -->
      <div class="flex flex-shrink-0 items-center gap-1.5">
        <CollaboratorStack
          :collaborators="props.collaborators"
          :current-user-id="props.currentUserId"
        />

        <slot name="actions" />

        <!-- Secondary actions — inline on large screens only -->
        <button
          v-if="props.editable"
          type="button"
          class="hidden h-8 w-8 items-center justify-center rounded-md transition-all xl:flex"
          :class="props.simulatorsActive
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
        <HeaderUserMenu
          :user-name="props.userName"
          :user-avatar="props.userAvatar"
          :account-label="t('header.account')"
        >
          <template #user-menu="slotProps">
            <slot name="user-menu" v-bind="slotProps" />
          </template>
        </HeaderUserMenu>

        <!-- Overflow "More" menu — shown until there's room for all actions inline -->
        <HeaderMoreMenu
          :editable="props.editable"
          :more-label="t('a11y.more')"
          :sandbox-label="t('header.sandbox')"
          :theme-label="t('header.theme')"
          @toggle-simulators="emit('toggle-simulators')"
        >
          <template #overflow-actions="slotProps">
            <slot name="overflow-actions" v-bind="slotProps" />
          </template>
        </HeaderMoreMenu>
      </div>
    </div>
  </header>
</template>
