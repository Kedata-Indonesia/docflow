import type { AIActionRequest, AIDraftCitation } from '@kedata-indonesia/docflow-core'
import type { Sparkles } from 'lucide-vue-next'
import type { LocaleContext } from '../../../composables/useLocale.js'

/** The locale lookup injected by `useLocale()`. */
export type Localize = LocaleContext['t']

/** One rendered conversation entry — user prompt or assistant answer. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  error?: boolean
  /**
   * Failure detail, kept SEPARATE from `text` so a mid-stream failure never
   * discards the partial answer the user already saw.
   */
  errorText?: string
  /**
   * Which transport produced the turn — a draft that errors still carries
   * unresolved `[n]` markers, so its Insert stays disabled.
   */
  kind?: 'chat' | 'draft'
  /** The citation table for a draft turn (set on the `done` event). */
  citations?: AIDraftCitation[]
}

/** A quick-macro button in the sidebar header grid. */
export interface QuickAction {
  label: string
  icon: typeof Sparkles
  color: string
  action?: AIActionRequest['action']
  prompt?: string
  needsSelection?: boolean
  improve?: boolean
  draft?: boolean
  disabled?: boolean
}

/** The macro shape `runMacro` accepts (a `QuickAction` is one). */
export type MacroSpec = Pick<
  QuickAction,
  'label' | 'action' | 'prompt' | 'needsSelection'
>

/** 7E-4 draft request — prompt plus bounded context, never the whole doc. */
export interface DraftRequest {
  prompt: string
  context?: { before: string; after: string }
}
