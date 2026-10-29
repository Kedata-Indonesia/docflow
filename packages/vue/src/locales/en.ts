/**
 * English messages, composed one file per UI namespace (`./en/<namespace>.ts`)
 * so no single locale file grows into an unreviewable 600-line table. The
 * composer order defines the public key order — keep `id.ts` in the same order
 * (guarded by `__tests__/locales.test.ts`).
 */
import common from './en/common.js'
import a11y from './en/a11y.js'
import header from './en/header.js'
import toolbar from './en/toolbar.js'
import statusBar from './en/statusBar.js'
import editor from './en/editor.js'
import slashMenu from './en/slashMenu.js'
import documentTabs from './en/documentTabs.js'
import theme from './en/theme.js'
import sidebars from './en/sidebars.js'
import dashboard from './en/dashboard.js'
import auth from './en/auth.js'
import language from './en/language.js'

export default {
  common,
  a11y,
  header,
  toolbar,
  statusBar,
  editor,
  slashMenu,
  documentTabs,
  theme,
  sidebars,
  dashboard,
  auth,
  language,
}
