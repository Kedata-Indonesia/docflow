import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmailDialog from '../components/EmailDialog.vue'

describe('EmailDialog', () => {
  it('uses muted styling for generated subject and body defaults', async () => {
    const wrapper = mount(EmailDialog, {
      props: {
        isOpen: true,
        documentTitle: 'Project Brief',
        shareUrl: 'https://example.com/doc/project-brief',
      },
    })

    const subject = wrapper.find('input[type="text"]:not([readonly])')
    const body = wrapper.find('textarea')
    const subjectElement = subject.element as HTMLInputElement
    const bodyElement = body.element as HTMLTextAreaElement

    expect(subjectElement.value).toContain('Project Brief')
    expect(bodyElement.value).toContain('https://example.com/doc/project-brief')
    expect(subject.classes()).toContain('text-slate-400')
    expect(body.classes()).toContain('text-slate-400')

    await subject.trigger('focus')
    await body.trigger('focus')

    expect(subject.classes()).toContain('text-slate-700')
    expect(subject.classes()).not.toContain('text-slate-400')
    expect(body.classes()).toContain('text-slate-700')
    expect(body.classes()).not.toContain('text-slate-400')

    await subject.trigger('blur')
    await body.trigger('blur')

    expect(subject.classes()).toContain('text-slate-400')
    expect(body.classes()).toContain('text-slate-400')

    wrapper.unmount()
  })
})
