<script setup lang="ts">
import type { LogEntry } from './types'

defineProps<{ events: LogEntry[] }>()

defineEmits<{ clear: [] }>()
</script>

<template>
  <section class="pg-card pg-log">
    <header class="pg-card__head">
      <span class="pg-card__title">Event log</span>
      <span class="pg-log__count">{{ events.length }}</span>
      <button class="pg-btn pg-btn--ghost" type="button" @click="$emit('clear')">Clear</button>
    </header>
    <ol class="pg-log__list">
      <li v-for="entry in events" :key="entry.id" class="pg-log__item">
        <code class="pg-log__name">{{ entry.name }}</code>
        <span v-if="entry.detail" class="pg-log__detail">{{ entry.detail }}</span>
      </li>
      <li v-if="events.length === 0" class="pg-log__empty">
        No events yet — click the toolbar, add a comment, or change a setting.
      </li>
    </ol>
  </section>
</template>
