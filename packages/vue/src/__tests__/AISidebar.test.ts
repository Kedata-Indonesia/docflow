import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createEditor } from '@kedata-indonesia/docflow-core'
import type { AIStreamFn } from '@kedata-indonesia/docflow-core'
import { defaultPlugins } from '@kedata-indonesia/docflow-plugins'
import AISidebar from '../components/sidebars/AISidebar.vue'

function makeFakeStream() {
  const queue: Array<{ type: 'chunk'; text: string } | { type: 'end' } | { type: 'error'; err: Error }> = []
  let notify: (() => void) | null = null
  const aiStream = (() => {
    return (async function* () {
      for (;;) {
        while (queue.length > 0) {
          const item = queue.shift()!
          if (item.type === 'chunk') { yield item.text; continue }
          if (item.type === 'error') throw item.err
          return
        }
        await new Promise<void>((r) => { notify = r })
        notify = null
      }
    })()
  }) as AIStreamFn
  return {
    aiStream,
    push: (t: string) => { queue.push({ type: 'chunk', text: t }); notify?.() },
    finish: () => { queue.push({ type: 'end' }); notify?.() },
    fail: (err: Error) => { queue.push({ type: 'error', err }); notify?.() },
  }
}

async function flush(times = 15) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('AISidebar (Phase 7D)', () => {
  let inst: ReturnType<typeof createEditor> | null = null

  afterEach(() => {
    inst?.destroy()
    document.body.innerHTML = ''
    inst = null
  })

  function setup(withStream = true) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const fake = makeFakeStream()
    inst = createEditor({ target, plugins: defaultPlugins, aiStream: withStream ? fake.aiStream : undefined })
    inst.editor.commands.insertContent('Hello world')
    return { editor: inst.editor, fake }
  }

  it('shows the not-configured notice when no aiStream is injected', () => {
    const { editor } = setup(false)
    const wrapper = mount(AISidebar, { props: { editor } })
    expect(wrapper.text()).toContain('AI is not configured')
    wrapper.unmount()
  })

  it('streams assistant tokens into the conversation', async () => {
    const { editor, fake } = setup()
    const wrapper = mount(AISidebar, { props: { editor } })

    const textarea = wrapper.find('textarea')
    await textarea.setValue('What is this document about?')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('What is this document about?')

    fake.push('This document ')
    await flush()
    fake.push('is about greetings.')
    await flush()
    expect(wrapper.text()).toContain('This document is about greetings.')

    fake.finish()
    await flush()
    await wrapper.vm.$nextTick()
    // Streaming cursor gone, action buttons visible.
    expect(wrapper.text()).not.toContain('▌')
    expect(wrapper.text()).toContain('Copy')
    expect(wrapper.text()).toContain('Insert')
    wrapper.unmount()
  })

  it('insert lands in the document as a ProseMirror transaction', async () => {
    const { editor, fake } = setup()
    const wrapper = mount(AISidebar, { props: { editor } })

    await wrapper.find('textarea').setValue('write something')
    await wrapper.find('form').trigger('submit')
    fake.push('generated text')
    await flush()
    fake.finish()
    await flush()
    await wrapper.vm.$nextTick()

    const insertBtn = wrapper.findAll('button').find((b) => b.text().includes('Insert'))
    expect(insertBtn).toBeDefined()
    await insertBtn!.trigger('click')

    const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size)
    expect(docText).toContain('generated text')
    wrapper.unmount()
  })

  it('inserts a markdown table as a real table node (not literal pipes)', async () => {
    const { editor, fake } = setup()
    const wrapper = mount(AISidebar, { props: { editor } })

    const md =
      '| Task | Description |\n|------|-------------|\n| Plan | Define scope |\n| Build | Execute plan |'

    await wrapper.find('textarea').setValue('write a project table')
    await wrapper.find('form').trigger('submit')
    fake.push(md)
    await flush()
    fake.finish()
    await flush()
    await wrapper.vm.$nextTick()

    const insertBtn = wrapper.findAll('button').find((b) => b.text().includes('Insert'))
    expect(insertBtn).toBeDefined()
    await insertBtn!.trigger('click')

    // The streamed markdown became a real `table` node — NOT literal `|` text.
    let tableCount = 0
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'table') tableCount++
    })
    expect(tableCount).toBe(1)

    const flat = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ')
    expect(flat).toContain('Task')
    expect(flat).toContain('Description')
    // No literal pipe-delimited header row leaked into the prose.
    expect(flat).not.toMatch(/\| Task \||------/)
    wrapper.unmount()
  })

  it('surfaces stream errors in the assistant turn', async () => {
    const { editor, fake } = setup()
    const wrapper = mount(AISidebar, { props: { editor } })

    await wrapper.find('textarea').setValue('hello')
    await wrapper.find('form').trigger('submit')
    fake.fail(new Error('provider unavailable'))
    await flush()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('provider unavailable')
    wrapper.unmount()
  })
})
