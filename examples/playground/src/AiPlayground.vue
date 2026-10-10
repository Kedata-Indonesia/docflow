<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import {
  claudeProvider,
  openaiCompatibleProvider,
  type AIProvider,
  type StreamEvent,
} from '@kedata-indonesia/docflow-vue'

/**
 * Browser-direct AI demo for the playground — exercises the shipped providers
 * (`claudeProvider` from #118, `openaiCompatibleProvider`) with a key the user
 * pastes here. The key stays in the browser (the BYOK model) and is never sent
 * anywhere except the provider endpoint.
 */
type ProviderId = 'claude' | 'openai-compatible'

const DEFAULTS: Record<ProviderId, { baseUrl: string; model: string }> = {
  claude: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest' },
  'openai-compatible': { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
}

const form = reactive({
  provider: 'claude' as ProviderId,
  baseUrl: DEFAULTS.claude.baseUrl,
  model: DEFAULTS.claude.model,
  apiKey: '',
  maxTokens: 1024,
  prompt: 'Write one sentence about A4 pagination.',
})

const output = ref('')
const streaming = ref(false)
let controller: AbortController | null = null

function onProviderChange() {
  form.baseUrl = DEFAULTS[form.provider].baseUrl
  form.model = DEFAULTS[form.provider].model
}

function buildProvider(): AIProvider {
  const auth = { type: 'bearer', apiKey: form.apiKey } as const
  if (form.provider === 'claude') {
    return claudeProvider({
      baseUrl: form.baseUrl || undefined,
      auth,
      model: form.model,
      maxTokens: Number(form.maxTokens) || 4096,
    })
  }
  return openaiCompatibleProvider({ baseUrl: form.baseUrl, auth, model: form.model })
}

// Hand the built provider up so the host can inject it into the editor
// (`:ai-stream="toAIStreamFn(provider)"`) — that's what makes the editor's AI
// sidebar usable. Null until a key is present.
const emit = defineEmits<{ provider: [provider: AIProvider | null] }>()
watch(
  () => ({ ...form }),
  () => emit('provider', form.apiKey ? buildProvider() : null),
  { immediate: true, deep: true },
)

async function stream() {
  if (!form.prompt.trim() || streaming.value) return
  output.value = ''
  streaming.value = true
  controller = new AbortController()
  const signal = controller.signal
  try {
    const provider = buildProvider()
    for await (const event of provider.complete({
      system: 'You are a concise writing assistant.',
      prompt: form.prompt,
      signal,
    }) as AsyncIterable<StreamEvent>) {
      if (event.type === 'delta') output.value += event.text
      else if (event.type === 'error') output.value += `\n[error] ${event.error.message}`
      else if (event.type === 'done') output.value += event.stopReason ? `\n[done: ${event.stopReason}]` : '\n[done]'
    }
    if (signal.aborted && !output.value) output.value = '[cancelled]'
  } catch (err) {
    output.value += `\n[fatal] ${String(err)}`
  } finally {
    streaming.value = false
    controller = null
  }
}

function cancel() {
  controller?.abort()
}
</script>

<template>
  <section class="pg-card pg-ai">
    <header class="pg-card__head">
      <span class="pg-card__title">AI providers</span>
      <span class="pg-badge">browser-direct</span>
    </header>

    <div class="pg-card__body">
      <p class="pg-hint">
        Streams from the shipped providers with a key you paste here. The key stays in the browser.
        Claude uses the native <code>claudeProvider</code> (issue #118). With a key set, the editor's
        <strong>AI sidebar</strong> (toolbar ✨) becomes available and streams through the same provider.
      </p>

      <label class="pg-field">
        <span class="pg-field__label">Provider</span>
        <select v-model="form.provider" class="pg-input pg-select" @change="onProviderChange">
          <option value="claude">Claude (Anthropic Messages API)</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </label>

      <label class="pg-field">
        <span class="pg-field__label">Base URL</span>
        <input v-model="form.baseUrl" class="pg-input" type="text" />
      </label>

      <label class="pg-field">
        <span class="pg-field__label">API key</span>
        <input v-model="form.apiKey" class="pg-input" type="password" placeholder="sk-…" autocomplete="off" />
      </label>

      <label class="pg-field">
        <span class="pg-field__label">Model</span>
        <input v-model="form.model" class="pg-input" type="text" />
      </label>

      <label v-if="form.provider === 'claude'" class="pg-field">
        <span class="pg-field__label">max_tokens <code>required</code></span>
        <input v-model.number="form.maxTokens" class="pg-input" type="number" min="1" />
      </label>

      <label class="pg-field">
        <span class="pg-field__label">Prompt</span>
        <textarea v-model="form.prompt" class="pg-input" rows="2" />
      </label>

      <div class="pg-row">
        <button class="pg-btn" type="button" :disabled="streaming" @click="stream">
          {{ streaming ? 'Streaming…' : 'Stream' }}
        </button>
        <button v-if="streaming" class="pg-btn pg-btn--ghost" type="button" @click="cancel">Cancel</button>
      </div>

      <pre v-if="output" class="pg-ai__output">{{ output }}</pre>
      <p class="pg-hint">
        OpenAI-compatible endpoints must send CORS headers (or be proxied); Anthropic browser calls use the
        provider's <code>anthropic-dangerous-direct-browser-access</code> header.
      </p>
    </div>
  </section>
</template>
