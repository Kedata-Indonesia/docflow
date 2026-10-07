<script setup lang="ts">
import type { DocumentMeta } from '../types.js'
import { useDraftModel } from '../composables/useDraftModel.js'
import FooterDialog from './FooterDialog.vue'
import HeaderFormatDialog from './HeaderFormatDialog.vue'
import PageNumberDialog from './PageNumberDialog.vue'
import EmailDialog from './EmailDialog.vue'
import DetailsDialog from './DetailsDialog.vue'
import LinkDialog from './LinkDialog.vue'
import PageSetupDialog from './PageSetupDialog.vue'

/**
 * Modal dialogs for DocsEditor: footer, header/footer format, page number,
 * email, document details, link and page setup.
 *
 * DocsEditor owns every draft ref (they are read through `wrapper.vm` by the
 * tests) and this component bridges them: values come in as props, edits go
 * out as `update:*` events, and user actions as intent events that the parent
 * executes. The dialog components themselves stay presentational.
 */
const props = defineProps<{
  showFooterModal: boolean
  showHeaderFormatModal: boolean
  showPageNumberModal: boolean
  showEmailModal: boolean
  showDetailsModal: boolean
  showLinkDialog: boolean
  showPageSetupModal: boolean
  footerLeft: string
  footerRight: string
  headerMarginCm: number
  footerMarginCm: number
  differentFirstPage: boolean
  differentOddEven: boolean
  pageNumberPosition: 'header' | 'footer'
  showPageNumberOnFirstPage: boolean
  pageNumberMode: 'startAt' | 'continue'
  pageNumberStartAt: number
  paperSize: string
  orientation: 'portrait' | 'landscape'
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  headerMarginMin: number
  headerMarginMax: number
  headerMarginStep: number
  pageMarginMin: number
  pageMarginMax: number
  documentTitle: string
  shareUrl: string
  documentMeta?: DocumentMeta
  linkDialogInitialText: string
  linkDialogInitialUrl: string
  linkDialogIsEditing: boolean
}>()

const emit = defineEmits<{
  'update:footerLeft': [value: string]
  'update:footerRight': [value: string]
  'update:headerMarginCm': [value: number]
  'update:footerMarginCm': [value: number]
  'update:differentFirstPage': [value: boolean]
  'update:differentOddEven': [value: boolean]
  'update:pageNumberPosition': [value: 'header' | 'footer']
  'update:showPageNumberOnFirstPage': [value: boolean]
  'update:pageNumberMode': [value: 'startAt' | 'continue']
  'update:pageNumberStartAt': [value: number]
  'update:paperSize': [value: string]
  'update:orientation': [value: 'portrait' | 'landscape']
  'update:marginTop': [value: number]
  'update:marginBottom': [value: number]
  'update:marginLeft': [value: number]
  'update:marginRight': [value: number]
  'close-footer': []
  'close-header-format': []
  'close-page-number': []
  'close-email': []
  'close-details': []
  'close-link': []
  'close-page-setup': []
  save: []
  'apply-header-format': []
  'apply-page-number': []
  'apply-page-setup': []
  'apply-link': [payload: { text: string; url: string }]
  'remove-link': []
  share: []
}>()

// Writable bridges: each dialog edits its local draft and the change flows
// back to DocsEditor as an `update:*` event (never a prop mutation).
const dFooterLeft = useDraftModel(() => props.footerLeft, (v) => emit('update:footerLeft', v))
const dFooterRight = useDraftModel(() => props.footerRight, (v) => emit('update:footerRight', v))
const dHeaderMarginCm = useDraftModel(() => props.headerMarginCm, (v) => emit('update:headerMarginCm', v))
const dFooterMarginCm = useDraftModel(() => props.footerMarginCm, (v) => emit('update:footerMarginCm', v))
const dDifferentFirstPage = useDraftModel(() => props.differentFirstPage, (v) => emit('update:differentFirstPage', v))
const dDifferentOddEven = useDraftModel(() => props.differentOddEven, (v) => emit('update:differentOddEven', v))
const dPageNumberPosition = useDraftModel(
  () => props.pageNumberPosition,
  (v) => emit('update:pageNumberPosition', v),
)
const dShowPageNumberOnFirstPage = useDraftModel(
  () => props.showPageNumberOnFirstPage,
  (v) => emit('update:showPageNumberOnFirstPage', v),
)
const dPageNumberMode = useDraftModel(() => props.pageNumberMode, (v) => emit('update:pageNumberMode', v))
const dPageNumberStartAt = useDraftModel(() => props.pageNumberStartAt, (v) => emit('update:pageNumberStartAt', v))
const dPaperSize = useDraftModel(() => props.paperSize, (v) => emit('update:paperSize', v))
const dOrientation = useDraftModel(() => props.orientation, (v) => emit('update:orientation', v))
const dMarginTop = useDraftModel(() => props.marginTop, (v) => emit('update:marginTop', v))
const dMarginBottom = useDraftModel(() => props.marginBottom, (v) => emit('update:marginBottom', v))
const dMarginLeft = useDraftModel(() => props.marginLeft, (v) => emit('update:marginLeft', v))
const dMarginRight = useDraftModel(() => props.marginRight, (v) => emit('update:marginRight', v))

// "Clear" resets both footer fields at once (pre-extraction behaviour).
const clearFooter = () => {
  dFooterLeft.value = ''
  dFooterRight.value = ''
}
</script>

<template>
  <!-- Dialog Footer Customization -->
  <FooterDialog
    v-model:left="dFooterLeft" v-model:right="dFooterRight" :is-open="showFooterModal"
    @clear="clearFooter" @close="emit('close-footer')" @save="emit('save')"
  />

  <!-- Dialog Header & Footer Format (Google Docs Style) -->
  <HeaderFormatDialog
    v-model:header-margin-cm="dHeaderMarginCm" v-model:footer-margin-cm="dFooterMarginCm"
    v-model:different-first-page="dDifferentFirstPage" v-model:different-odd-even="dDifferentOddEven"
    :is-open="showHeaderFormatModal" :margin-min="headerMarginMin" :margin-max="headerMarginMax"
    :margin-step="headerMarginStep"
    @close="emit('close-header-format')" @apply="emit('apply-header-format')"
  />

  <!-- Dialog Nomor Halaman (Google Docs Style) -->
  <PageNumberDialog
    v-model:position="dPageNumberPosition" v-model:show-on-first-page="dShowPageNumberOnFirstPage"
    v-model:mode="dPageNumberMode" v-model:start-at="dPageNumberStartAt"
    :is-open="showPageNumberModal"
    @close="emit('close-page-number')" @apply="emit('apply-page-number')"
  />

  <!-- Dialog Email -->
  <EmailDialog
    :is-open="showEmailModal" :document-title="documentTitle" :share-url="shareUrl"
    @close="emit('close-email')" @copy-link="emit('share')"
  />

  <!-- Dialog Details -->
  <DetailsDialog :is-open="showDetailsModal" :meta="documentMeta" @close="emit('close-details')" />

  <!-- Dialog Link -->
  <LinkDialog
    :is-open="showLinkDialog" :initial-text="linkDialogInitialText" :initial-url="linkDialogInitialUrl"
    :is-editing="linkDialogIsEditing"
    @apply="(payload) => emit('apply-link', payload)" @remove="emit('remove-link')"
    @close="emit('close-link')"
  />

  <!-- Dialog Page Setup -->
  <PageSetupDialog
    v-model:paper-size="dPaperSize" v-model:orientation="dOrientation"
    v-model:margin-top="dMarginTop" v-model:margin-bottom="dMarginBottom"
    v-model:margin-left="dMarginLeft" v-model:margin-right="dMarginRight"
    :is-open="showPageSetupModal" :margin-min="pageMarginMin" :margin-max="pageMarginMax"
    @close="emit('close-page-setup')" @apply="emit('apply-page-setup')"
  />
</template>
