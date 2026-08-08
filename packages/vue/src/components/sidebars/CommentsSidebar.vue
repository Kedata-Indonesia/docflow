<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  MessageSquare,
  CheckCircle,
  Reply,
  Send,
  MessageCircle,
  Trash2,
} from 'lucide-vue-next'
import type { CommentItem } from '../../types.js'
import { useLocale } from '../../composables/useLocale.js'

const props = defineProps<{
  comments?: CommentItem[]
  selectedTextSnippet?: string
  selectedTextIndex?: number
  /** Issue #133 — ids of anchored threads whose `comment` mark is no
   *  longer in the document (the anchored text was deleted). The sidebar
   *  renders those with a "text deleted" badge + a Delete action. */
  orphanedIds?: string[]
}>()

const emit = defineEmits<{
  'add-comment': [content: string, anchorText?: string, anchorIndex?: number]
  'add-reply': [commentId: string, content: string]
  'resolve-comment': [commentId: string]
  'delete-comment': [commentId: string]
}>()

const { t } = useLocale()

const commentInput = ref('')
const replyInput = ref<Record<string, string>>({})
const activeReplyId = ref<string | null>(null)
const filterMode = ref<'active' | 'resolved'>('active')

const filteredComments = computed(() =>
  (props.comments ?? []).filter((c) =>
    filterMode.value === 'resolved' ? c.resolved : !c.resolved,
  ),
)

function handleSubmitComment() {
  if (!commentInput.value.trim()) return
  emit(
    'add-comment',
    commentInput.value.trim(),
    props.selectedTextSnippet,
    props.selectedTextIndex,
  )
}

function handleSubmitReply(commentId: string) {
  const input = replyInput.value[commentId] || ''
  if (!input.trim()) return
  emit('add-reply', commentId, input.trim())
  replyInput.value = { ...replyInput.value, [commentId]: '' }
  activeReplyId.value = null
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function isOrphaned(comment: CommentItem): boolean {
  return props.orphanedIds?.includes(comment.id) === true
}

function handleDeleteComment(commentId: string) {
  // Confirm here rather than in the host — keeps the destructive action
  // close to its trigger and avoids a host-level modal dependency.
  if (typeof window !== 'undefined' && !window.confirm(t('sidebars.comments.confirmDelete'))) {
    return
  }
  emit('delete-comment', commentId)
}
</script>

<template>
  <div class="comments-sidebar flex h-full w-80 flex-shrink-0 flex-col border-l border-slate-200 bg-white/80 text-slate-800 backdrop-blur-xl transition-all dark:border-white/5 dark:bg-[#0a0f1e]/85 dark:text-slate-100">
    <div class="border-b border-slate-200 p-4 dark:border-white/5">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <MessageSquare class="h-4 w-4 text-cyan-400" /> {{ t('sidebars.comments.title') }}
        </h3>

        <div class="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-[11px] font-semibold dark:border-white/10 dark:bg-white/[0.02]">
          <button
            type="button"
            :class="filterMode === 'active' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-600'"
            class="rounded-lg px-2.5 py-1 transition-all"
            @click="filterMode = 'active'"
          >
            {{ t('sidebars.comments.active') }}
          </button>
          <button
            type="button"
            :class="filterMode === 'resolved' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-600'"
            class="rounded-lg px-2.5 py-1 transition-all"
            @click="filterMode = 'resolved'"
          >
            {{ t('sidebars.comments.resolved') }}
          </button>
        </div>
      </div>

      <div
        v-if="selectedTextSnippet"
        class="mb-1 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-2.5 text-xs text-cyan-700 animate-fadeIn dark:border-cyan-500/15 dark:bg-cyan-500/10 dark:text-cyan-400"
      >
        <p class="mb-1 font-mono text-[9px] font-bold uppercase tracking-wider">{{ t('sidebars.comments.creatingAnchored') }}</p>
        <p class="line-clamp-1 border-l-2 border-cyan-400 bg-cyan-500/10 py-0.5 pl-2.5 italic dark:bg-cyan-500/5">
          "{{ selectedTextSnippet }}"
        </p>
      </div>
    </div>

    <div class="flex-1 space-y-4 overflow-y-auto p-4">
      <div
        v-for="comment in filteredComments"
        :key="comment.id"
        class="relative space-y-3 rounded-2xl border border-slate-200/60 bg-slate-50/60 p-4 transition-all hover:border-cyan-500/30 hover:shadow-cyan dark:border-white/5 dark:bg-[#02040a]/40"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <div
              class="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
              :style="{ backgroundColor: comment.authorColor }"
            >
              {{ getInitials(comment.authorName) }}
            </div>
            <div>
              <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200">{{ comment.authorName }}</h4>
              <p class="font-mono text-[9px] text-slate-400 dark:text-slate-500">
                {{ new Date(comment.createdAt).toLocaleTimeString() }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              v-if="!comment.resolved"
              type="button"
              class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-green-500/10 hover:text-green-500"
              :title="t('sidebars.comments.resolve')"
              @click="emit('resolve-comment', comment.id)"
            >
              <CheckCircle class="h-4 w-4" />
            </button>
            <button
              v-if="isOrphaned(comment)"
              type="button"
              class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              :title="t('sidebars.comments.delete')"
              @click="handleDeleteComment(comment.id)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          v-if="isOrphaned(comment)"
          class="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:border-amber-500/30 dark:text-amber-400"
        >
          {{ t('sidebars.comments.orphaned') }}
        </div>

        <div
          v-if="comment.anchorText"
          class="max-w-full truncate rounded-r-lg border-l-2 py-1 pl-2.5 text-[10px] italic text-slate-500 dark:text-slate-400"
          :class="isOrphaned(comment)
            ? 'border-amber-500/50 bg-amber-50/50 line-through opacity-70 dark:border-amber-500/40 dark:bg-amber-500/5'
            : 'border-cyan-500/50 bg-slate-100 dark:border-cyan-500/40 dark:bg-white/5'"
        >
          {{ t('sidebars.comments.quote') }} "{{ comment.anchorText }}"
        </div>

        <p class="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {{ comment.content }}
        </p>

        <div v-if="comment.replies.length > 0" class="space-y-2.5 border-l border-slate-200 pl-4 pt-1 dark:border-white/10">
          <div v-for="reply in comment.replies" :key="reply.id" class="space-y-1">
            <div class="flex items-center gap-1.5">
              <div
                class="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[8px] font-bold text-white shadow-sm"
                :style="{ backgroundColor: reply.authorColor }"
              >
                {{ getInitials(reply.authorName) }}
              </div>
              <span class="text-[10px] font-bold text-slate-600 dark:text-slate-300">{{ reply.authorName }}</span>
              <span class="font-mono text-[8px] text-slate-400 dark:text-slate-500">{{ new Date(reply.createdAt).toLocaleTimeString() }}</span>
            </div>
            <p class="break-words pl-1 text-xs text-slate-600 dark:text-slate-400">{{ reply.content }}</p>
          </div>
        </div>

        <div v-if="!comment.resolved" class="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/5">
          <div v-if="activeReplyId === comment.id" class="flex w-full items-center gap-1.5">
            <input
              v-model="replyInput[comment.id]"
              type="text"
              :placeholder="t('sidebars.comments.reply')"
              class="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-cyan-500/50 focus:outline-none dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30"
              @keydown.enter="handleSubmitReply(comment.id)"
            >
            <button
              type="button"
              class="rounded-lg bg-cyan-500 p-1.5 font-bold text-black shadow-cyan hover:bg-cyan-400"
              @click="handleSubmitReply(comment.id)"
            >
              <Send class="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            v-else
            type="button"
            class="flex items-center gap-1 text-[10px] font-bold text-cyan-600 transition-all hover:text-cyan-500"
            @click="activeReplyId = comment.id"
          >
            <Reply class="h-3 w-3" /> {{ t('sidebars.comments.replyInThread') }}
          </button>
        </div>

        <div
          v-if="comment.resolved"
          class="rounded-lg border border-green-100/40 bg-green-50/55 p-2 text-[10px] text-green-700 dark:border-green-500/10 dark:bg-green-950/10 dark:text-green-400"
        >
          {{ t('sidebars.comments.resolvedBy').replace('{user}', comment.resolvedByName || comment.resolvedBy || 'You') }}
          <span v-if="comment.resolvedAt">at {{ new Date(comment.resolvedAt).toLocaleTimeString() }}</span>
        </div>
      </div>

      <div v-if="filteredComments.length === 0" class="py-12 text-center text-slate-400 dark:text-slate-500">
        <MessageCircle class="mx-auto mb-2 h-8 w-8 text-cyan-500 opacity-50" />
        <p class="text-xs">{{ t('sidebars.comments.noComments').replace('{mode}', filterMode) }}</p>
      </div>
    </div>

    <div v-if="filterMode === 'active'" class="border-t border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-[#0a0f1e]/80">
      <form class="space-y-2" @submit.prevent="handleSubmitComment">
        <textarea
          v-model="commentInput"
          rows="2"
          :placeholder="selectedTextSnippet ? t('sidebars.comments.commentOnSelection') : t('sidebars.comments.generalComment')"
          class="w-full min-h-[60px] resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 transition-all focus:border-cyan-500/50 focus:shadow-cyan focus:outline-none dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-100 dark:focus:border-cyan-500/30"
        />
        <div class="flex items-center justify-between">
          <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {{ selectedTextSnippet ? t('sidebars.comments.anchoredComment') : t('sidebars.comments.general') }}
          </span>
          <button
            type="submit"
            :disabled="!commentInput.trim()"
            class="flex items-center gap-1 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-bold text-black shadow-cyan transition-all hover:bg-cyan-400 disabled:opacity-50"
          >
            <Send class="h-3.5 w-3.5" /> {{ t('sidebars.comments.post') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
