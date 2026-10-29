<script setup lang="ts">
import type { Collaborator } from '../../types.js'
import { getInitials } from './initials.js'

/** Overlapping avatar stack of the live collaborators (large screens only). */
defineProps<{
  collaborators: Collaborator[]
  currentUserId: string
}>()
</script>

<template>
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
</template>
