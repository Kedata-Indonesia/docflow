<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { Star, Share2, Users, ChevronDown, MoreVertical } from 'lucide-vue-next'
import type { Collaborator } from '../types.js'
import ThemeToggle from './ThemeToggle.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    editable?: boolean
    collaborators?: Collaborator[]
    starred?: boolean
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
  export: [format: 'markdown' | 'html' | 'txt']
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

const handleExport = (format: 'markdown' | 'html' | 'txt') => {
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
  sub?: { label: string; action: string; badge?: string }[]
}

const menus: Record<string, { label: string; items: MenuItem[] }> = {
  File: {
    label: 'File',
    items: [
      { label: 'Penataan halaman...', action: 'page-setup' },
      { label: 'divider', divider: true },
      {
        label: 'Unduh', sub: [
          { label: 'Markdown (.md)', action: 'export:markdown', badge: 'MD' },
          { label: 'Halaman web (.html)', action: 'export:html', badge: 'HTML' },
          { label: 'Teks biasa (.txt)', action: 'export:txt', badge: 'TXT' },
        ]
      },
      { label: 'Cetak...', action: 'print' },
    ],
  },
  Edit: {
    label: 'Edit',
    items: [
      { label: 'Urungkan', action: 'undo' },
      { label: 'Ulangi', action: 'redo' },
      { label: 'divider', divider: true },
      { label: 'Pilih semua', action: 'select-all' },
    ],
  },
  View: {
    label: 'Tampilan',
    items: [
      { label: 'Tampilkan sidebar', action: 'toggle-left-sidebar' },
      { label: 'divider', divider: true },
      { label: 'Mode Penuh (Fokus)', action: 'toggle-focus-mode' },
      { label: 'Tampilkan penggaris', action: 'toggle-ruler' },
    ],
  },
  Insert: {
    label: 'Sisipkan',
    items: [
      { label: 'Catatan Rapat', action: 'meeting-notes' },
      { label: 'Draf Email', action: 'email-draft' },
      { label: 'divider', divider: true },
      { label: 'Gambar', action: 'insert-image' },
      { label: 'Tabel', action: 'insert-table' },
      { label: 'Kode Blok', action: 'insert-code' },
      { label: 'divider', divider: true },
      { label: 'Header', action: 'insert-header' },
      { label: 'Footer', action: 'insert-footer' },
      { label: 'Catatan Kaki', action: 'insert-footnote' },
    ],
  },
  Format: {
    label: 'Format',
    items: [
      { label: 'Teks Tebal', action: 'bold' },
      { label: 'Teks Miring', action: 'italic' },
      { label: 'Garis Bawah', action: 'underline' },
      { label: 'divider', divider: true },
      { label: 'Judul 1', action: 'heading1' },
      { label: 'Judul 2', action: 'heading2' },
      { label: 'Judul 3', action: 'heading3' },
    ],
  },
  Tools: {
    label: 'Alat',
    items: [
      { label: 'Periksa ejaan', action: 'spellcheck' },
      { label: 'Hitungan kata', action: 'word-count' },
      { label: 'divider', divider: true },
      { label: 'Preferensi', action: 'preferences' },
    ],
  },
  Extensions: {
    label: 'Ekstensi',
    items: [
      { label: 'Kelola ekstensi...', action: 'manage-extensions' },
    ],
  },
  Help: {
    label: 'Bantuan',
    items: [
      { label: 'Pintasan keyboard', action: 'keyboard-shortcuts' },
      { label: 'divider', divider: true },
      { label: 'Laporkan masalah', action: 'report-issue' },
      { label: 'Tentang DocsEditor', action: 'about' },
    ],
  },
}

const menuKeys = Object.keys(menus)

// Sub-menu hover state
const hoveredSub = ref<string | null>(null)

const toggleMenu = (key: string) => {
  activeMenu.value = activeMenu.value === key ? null : key
  hoveredSub.value = null
}

// Overflow ("More") menu for secondary actions on small screens.
const moreOpen = ref(false)
const toggleMore = () => {
  moreOpen.value = !moreOpen.value
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
  } else {
    emit('menu-click', action)
  }
  activeMenu.value = null
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
          title="Back to Documents"
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
              title="Click to rename"
              @click="isRenaming = true"
            >
              {{ props.title }}
            </h1>

            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-amber-500"
              :title="starred ? 'Unstar document' : 'Star document'"
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
                      class="flex w-full items-center px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                      @click.stop="handleMenuAction(item.action!)"
                    >
                      {{ item.label }}
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
          title="Sandbox (toggle simulated collaborators)"
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
          <span class="hidden sm:inline">Share</span>
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
            <span class="hidden max-w-[140px] truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:inline">{{ userName || 'Account' }}</span>
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
                <p class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ userName || 'Account' }}</p>
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
                <span>Sandbox</span>
              </button>
              <div class="my-1 border-t border-slate-100 dark:border-slate-700/80" />
              <div class="flex items-center justify-between px-4 py-2">
                <span>Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </header>
</template>
