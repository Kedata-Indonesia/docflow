<script setup lang="ts">
import { computed, type Component } from 'vue'
import { BookOpen, FileText, History, MessageSquare, Sparkles } from 'lucide-vue-next'
import type { SidebarKey } from '../../types.js'
import { useLocale } from '../../composables/useLocale.js'
import { sidebarActiveClass, sidebarInactiveClass } from './toolbarConfig.js'

const { t } = useLocale()

const props = defineProps<{
  activeSidebar?: SidebarKey | null
  hasAi?: boolean
  hasCitationPlugin?: boolean
}>()

const emit = defineEmits<{
  'toggle-sidebar': [key: SidebarKey]
}>()

interface SidebarToggle {
  key: SidebarKey
  label: string
  icon: Component
  relative?: boolean
}

const toggles = computed<SidebarToggle[]>(() => {
  const items: SidebarToggle[] = [
    { key: 'comments', label: t('toolbar.comments'), icon: MessageSquare, relative: true },
    { key: 'history', label: t('toolbar.history'), icon: History },
  ]
  if (props.hasAi) {
    items.push({ key: 'ai', label: t('toolbar.ai'), icon: Sparkles })
  }
  items.push({ key: 'toc', label: t('toolbar.tableOfContents'), icon: FileText })
  if (props.hasCitationPlugin) {
    items.push({ key: 'references', label: t('toolbar.references'), icon: BookOpen })
  }
  return items
})

function sidebarClass(key: SidebarKey) {
  return props.activeSidebar === key ? sidebarActiveClass : sidebarInactiveClass
}
</script>

<template>
  <button
    v-for="toggle in toggles"
    :key="toggle.key"
    type="button"
    :class="[
      'docs-editor-toolbar__control flex h-8 w-8 items-center justify-center rounded-md transition-all',
      toggle.relative ? 'relative' : '',
      sidebarClass(toggle.key),
    ]"
    :title="toggle.label"
    :aria-label="toggle.label"
    @click="emit('toggle-sidebar', toggle.key)"
  >
    <component :is="toggle.icon" class="h-[18px] w-[18px]" />
  </button>
</template>
