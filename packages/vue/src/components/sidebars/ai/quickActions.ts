import { AlignLeft, BadgeCheck, Globe, PencilLine, Quote, Wand2 } from 'lucide-vue-next'
import type { Localize, QuickAction } from './types.js'

/**
 * The macro grid above the conversation. `draftAvailable` is false when the host
 * did not inject `aiDraft` — the draft toggle is then rendered disabled instead
 * of pretending to work.
 */
export function buildQuickActions(t: Localize, draftAvailable: boolean): QuickAction[] {
  return [
    {
      label: t('sidebars.ai.summarize'),
      icon: AlignLeft,
      color: 'text-cyan-500',
      action: 'summarize',
      needsSelection: true,
    },
    {
      label: t('sidebars.ai.fixGrammar'),
      icon: BadgeCheck,
      color: 'text-emerald-500',
      action: 'grammar',
      needsSelection: true,
    },
    {
      label: t('sidebars.ai.continue'),
      icon: Wand2,
      color: 'text-amber-500',
      action: 'generate',
      prompt: 'Continue writing naturally from where the text ends, matching the existing style.',
    },
    {
      label: t('sidebars.ai.toSpanish'),
      icon: Globe,
      color: 'text-cyan-500',
      action: 'translate',
      prompt: 'translate to Spanish',
      needsSelection: true,
    },
    {
      label: t('sidebars.ai.improveSelection'),
      icon: PencilLine,
      color: 'text-violet-500',
      improve: true,
      needsSelection: true,
    },
    {
      label: t('sidebars.ai.draft'),
      icon: Quote,
      color: 'text-cyan-500',
      draft: true,
      disabled: !draftAvailable,
    },
  ]
}
