import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vite-plus/test'

import scrollIntoView from '../../src/index.ts'
import {
  expectApprox,
  getElement,
  hideFrameElement,
  mockPrefersReducedMotion,
  render,
} from './utils.ts'

const tallPage = `
  <div id="top" style="height: 20px; background: #eee">top</div>
  <div style="height: 2000px"></div>
  <div id="target" style="height: 40px; background: #cfc">target</div>
  <div style="height: 2000px"></div>
`

const nestedPage = `
  <div id="scroller">
    <div style="height: 400px"></div>
    <div id="nested-target" style="height: 40px; background: #cfc">nested</div>
    <div style="height: 400px"></div>
  </div>
`

const nestedCss = `
  #scroller {
    width: 300px;
    height: 200px;
    overflow: auto;
    border: 1px solid #000;
  }
`

beforeEach(() => {
  hideFrameElement()
  window.scrollTo(0, 0)
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

afterEach(() => {
  window.scrollTo(0, 0)
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('scroll-into-view-transition in Chromium', () => {
  test('scrolls the window to the target with a view transition', async () => {
    render(tallPage, '')
    const target = getElement('#target')

    expect(typeof document.startViewTransition).toBe('function')

    const startViewTransition = vi.spyOn(document, 'startViewTransition')
    await scrollIntoView(target, { block: 'start', duration: 50 })

    expect(startViewTransition).toHaveBeenCalled()
    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
  })

  test('falls back to an instant scroll without startViewTransition', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    try {
      await scrollIntoView(target, { block: 'start', duration: 200 })
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
    }

    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
  })

  test('falls back to an instant scroll with prefers-reduced-motion', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    const restore = mockPrefersReducedMotion(true)
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    try {
      await scrollIntoView(target, { block: 'start', duration: 200 })
    } finally {
      restore()
    }

    expect(startViewTransition).not.toHaveBeenCalled()
    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
  })

  test('scrolls a nested scroll container', async () => {
    render(nestedPage, nestedCss)
    const scroller = getElement('#scroller')
    const target = getElement('#nested-target')

    await scrollIntoView(target, {
      block: 'start',
      duration: 50,
      boundary: scroller,
    })

    expect(scroller.scrollTop).toBeGreaterThan(0)
    const scrollerBox = scroller.getBoundingClientRect()
    const targetBox = target.getBoundingClientRect()
    expect(
      targetBox.top >= scrollerBox.top - 1 &&
        targetBox.bottom <= scrollerBox.bottom + 1,
    ).toBe(true)
  })

  test("scroll: 'if-needed' is a no-op when the target is already visible", async () => {
    render(
      `<div id="visible" style="height: 40px; background: #cfc">visible</div>`,
      '',
    )
    const target = getElement('#visible')
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    const actions = await scrollIntoView(target, {
      scroll: 'if-needed',
      block: 'nearest',
      inline: 'nearest',
      duration: 50,
    })

    expect(actions).toEqual([])
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(window.scrollY).toBe(0)
  })

  test('resolves when a transition is skipped by a newer one', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    const top = getElement('#top')

    const first = scrollIntoView(target, { block: 'start', duration: 500 })
    // Starting another transition skips the previous browser transition.
    const second = scrollIntoView(top, { block: 'start', duration: 50 })

    await expect(first).resolves.toEqual(expect.any(Array))
    await expect(second).resolves.toEqual(expect.any(Array))
    expectApprox(window.scrollY, top.offsetTop, 2, 'window.scrollY after skip')
  })

  test('behavior: auto jumps without starting a view transition', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    await scrollIntoView(target, { behavior: 'auto', block: 'start' })

    expect(startViewTransition).not.toHaveBeenCalled()
    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
  })
})
