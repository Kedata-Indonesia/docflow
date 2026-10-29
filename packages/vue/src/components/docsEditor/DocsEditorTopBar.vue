<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { DocumentMode, DocsEditorPlugin } from '@kedata-indonesia/docflow-core'
import { Minimize2 } from 'lucide-vue-next'
import type { Collaborator, SidebarKey } from '../../types.js'
import type { ExportFormat } from '../headerBarActions.js'
import { useLocale } from '../../composables/useLocale.js'
import HeaderBar from '../HeaderBar.vue'
import EditorToolbar from '../EditorToolbar.vue'

/**
 * Editor chrome above the page surface: header bar, toolbar and the floating
 * "leave focus mode" button. Presentational only — `DocsEditor` owns every
 * piece of state.
 *
 * `header-actions`, `overflow-actions` and `user-menu` are forwarded verbatim
 * to `HeaderBar` so hosts keep their slots.
 */

const props = defineProps<{
  title?: string
  editable?: boolean
  collaborators?: Collaborator[]
  starred?: boolean
  userName?: string
  userAvatar?: string
  pageless?: boolean
  outlineOpen?: boolean
  showRuler?: boolean
  focusMode?: boolean
  mode?: DocumentMode
  hasCitationPlugin?: boolean
  unimplementedActions?: Array<string | { action: string; reason?: string }>
  actions: Record<string, (...args: unknown[]) => boolean>
  plugins?: DocsEditorPlugin[]
  editor?: Editor | null
  activeSidebar?: SidebarKey | null
  zoom?: number
  zoomDisabled?: boolean
}>()

const emit = defineEmits<{
  back: []
  'update:title': [title: string]
  'toggle-star': []
  export: [format: ExportFormat]
  share: []
  'menu-click': [menu: string]
  'toggle-sidebar': [key: SidebarKey]
  print: []
  'update:zoom': [zoom: number]
  'update:focus-mode': [focusMode: boolean]
}>()

defineSlots<{
  'header-actions'?: () => unknown
  'overflow-actions'?: (props: { close: () => void }) => unknown
  'user-menu'?: (props: { close: () => void }) => unknown
}>()

const { t } = useLocale()
</script>

<template>
  <HeaderBar
    v-if="!props.focusMode"
    :title="props.title" :editable="props.editable" :collaborators="props.collaborators"
    :starred="props.starred" :user-name="props.userName" :user-avatar="props.userAvatar"
    :pageless="props.pageless" :outline-open="props.outlineOpen" :show-ruler="props.showRuler"
    :focus-mode="props.focusMode" :mode="props.mode" :has-citation-plugin="props.hasCitationPlugin"
    :unimplemented-actions="props.unimplementedActions"
    @menu-click="emit('menu-click', $event)" @back="emit('back')"
    @update:title="emit('update:title', $event)" @toggle-star="emit('toggle-star')"
    @export="emit('export', $event)" @share="emit('share')"
  >
    <template #actions><slot name="header-actions" /></template>
    <template #overflow-actions="slotProps"><slot name="overflow-actions" v-bind="slotProps" /></template>
    <template #user-menu="slotProps"><slot name="user-menu" v-bind="slotProps" /></template>
  </HeaderBar>
  <EditorToolbar
    v-if="!props.focusMode"
    :actions="props.actions" :plugins="props.plugins" :editor="props.editor"
    :active-sidebar="props.activeSidebar" :zoom="props.zoom" :zoom-disabled="props.zoomDisabled"
    @toggle-sidebar="emit('toggle-sidebar', $event)" @print="emit('print')"
    @update:zoom="emit('update:zoom', $event)"
  />
  <!-- Floating exit button shown only while focus mode is active -->
  <button
    v-if="props.focusMode" type="button"
    class="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-[#0e1525] dark:text-slate-300 dark:hover:bg-white/5"
    :title="t('header.focusMode')" :aria-label="t('header.focusMode')"
    @click="emit('update:focus-mode', false)"
  >
    <Minimize2 class="h-5 w-5" />
  </button>
</template>
