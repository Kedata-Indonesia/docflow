/**
 * Mount/unmount harness for `e2e/library` (issue #222).
 *
 * The showcase specs run against the demo app, so they cannot unmount the editor
 * without tearing down the page. This entry mounts a plain `createEditor()`
 * instance into an empty host on demand and exposes the bookkeeping the specs
 * assert on: instances created/destroyed, the net delta of `document` listeners,
 * and every error the page saw.
 *
 * Why the listener counter: a plugin that adds a global listener and forgets its
 * teardown leaks it on every mount, which a page-level test cannot see. Wrapping
 * add/removeEventListener before the editor is created turns that leak into a
 * number the spec can compare against the pre-mount baseline.
 */
import '@kedata-indonesia/docflow-vue/style.css'
import { createEditor, type DocsEditor } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'

const host = document.querySelector<HTMLElement>('#host')
if (!host) throw new Error('lifecycle harness: #host is missing')

/** Net delta per event type; a leaked listener stays positive after unmount. */
const listenerDelta = new Map<string, number>()
const addListener = document.addEventListener.bind(document)
const removeListener = document.removeEventListener.bind(document)

document.addEventListener = ((type: string, ...rest: unknown[]) => {
  listenerDelta.set(type, (listenerDelta.get(type) ?? 0) + 1)
  return (addListener as (...a: unknown[]) => void)(type, ...rest)
}) as typeof document.addEventListener

document.removeEventListener = ((type: string, ...rest: unknown[]) => {
  listenerDelta.set(type, (listenerDelta.get(type) ?? 0) - 1)
  return (removeListener as (...a: unknown[]) => void)(type, ...rest)
}) as typeof document.removeEventListener

const errors: string[] = []
window.addEventListener('error', (event) => errors.push(String(event.message)))
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)))

export interface LifecycleHarness {
  mounts: number
  unmounts: number
  errors: string[]
  liveEditors: () => number
  netListeners: () => number
  listenerDelta: () => Record<string, number>
  mount: () => boolean
  unmount: () => boolean
  html: () => string
}

let instance: DocsEditor | null = null

const harness: LifecycleHarness = {
  mounts: 0,
  unmounts: 0,
  errors,
  liveEditors: () => document.querySelectorAll('.ProseMirror').length,
  netListeners: () => [...listenerDelta.values()].reduce((sum, n) => sum + n, 0),
  listenerDelta: () => Object.fromEntries(listenerDelta),
  mount: () => {
    // One instance at a time: a host that mounts twice without unmounting is the
    // bug this harness is meant to reveal, not a state the harness should allow.
    if (instance) return false
    const target = document.createElement('div')
    target.id = 'editor'
    host.replaceChildren(target)
    // Same plugin set the demo app uses: the paste spec needs the table
    // extensions, and the listener assertions are only meaningful for the
    // configuration consumers actually run.
    instance = createEditor({
      target,
      content: '<p>lifecycle probe</p>',
      plugins: defaultPlugins,
    })
    harness.mounts += 1
    return true
  },
  unmount: () => {
    if (!instance) return false
    instance.destroy()
    instance = null
    harness.unmounts += 1
    host.replaceChildren()
    return true
  },
  html: () => instance?.getHTML() ?? '',
}

declare global {
  interface Window {
    __lifecycle?: LifecycleHarness
  }
}

window.__lifecycle = harness

document.querySelector('#mount')?.addEventListener('click', () => harness.mount())
document.querySelector('#unmount')?.addEventListener('click', () => harness.unmount())
