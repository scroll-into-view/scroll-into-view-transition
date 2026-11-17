import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from 'vite-plus/test'

import scrollIntoView from '../../src/index.ts'
import {
  expectApprox,
  getElement,
  hideFrameElement,
  mockPrefersReducedMotion,
  render,
} from './utils.ts'

const runningTransition = (
  spy: MockInstance<Document['startViewTransition']>,
): ViewTransition => {
  const result = spy.mock.results.at(-1)
  if (!result || result.type !== 'return') {
    throw new Error('No view transition was started')
  }
  return result.value
}

const translateOf = (pseudo: string) => {
  const [x = '0', y = '0'] = getComputedStyle(
    document.documentElement,
    pseudo,
  ).translate.split(' ')
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 }
}

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

describe('scroll-into-view-transition in the browser', () => {
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

  test('animates the snapshots with CSS keyframes, clamped to the viewport', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    const done = scrollIntoView(target, { block: 'start', duration: 1000 })
    const transition = runningTransition(startViewTransition)
    await transition.ready

    const animations = document
      .getAnimations()
      .filter(
        (animation) =>
          (animation.effect as KeyframeEffect).pseudoElement ===
          '::view-transition-new(root)',
      )
    expect(animations).toHaveLength(1)
    expect(animations[0]?.constructor.name).toBe('CSSAnimation')
    const start = translateOf('::view-transition-new(root)')
    // Scrolling down 2020px starts the new snapshot one viewport below
    expect(start.y).toBeGreaterThan(0)
    expect(start.y).toBeLessThanOrEqual(document.documentElement.clientHeight)

    transition.skipTransition()
    await done
    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
  })

  test('pins fixed and sticky elements, and restores their names', async () => {
    render(
      `<header id="fixed">fixed</header><nav id="sticky">sticky</nav>${tallPage}`,
      `#fixed { position: fixed; top: 0; left: 0; height: 20px }
       #sticky { position: sticky; top: 20px; height: 20px; view-transition-name: none }`,
    )
    const fixed = getElement('#fixed')
    const sticky = getElement('#sticky')
    const target = getElement('#target')
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    const done = scrollIntoView(target, { block: 'start', duration: 1000 })
    const transition = runningTransition(startViewTransition)
    await transition.ready

    expect(getComputedStyle(fixed).viewTransitionName).not.toBe('none')
    expect(getComputedStyle(sticky).viewTransitionName).not.toBe('none')

    transition.skipTransition()
    await done
    expect(fixed.style.viewTransitionName).toBe('')
    expect(getComputedStyle(fixed).viewTransitionName).toBe('none')
    expect(getComputedStyle(sticky).viewTransitionName).toBe('none')
    expect(document.head.querySelectorAll('style')).toHaveLength(1)
  })

  test('clips a nested scroller only along the scrolling axis', async () => {
    render(nestedPage, nestedCss)
    const scroller = getElement('#scroller')
    const target = getElement('#nested-target')
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    const done = scrollIntoView(target, {
      block: 'start',
      duration: 1000,
      boundary: scroller,
    })
    const transition = runningTransition(startViewTransition)
    await transition.ready

    const name = scroller.style.viewTransitionName
    expect(name).not.toBe('')
    const group = getComputedStyle(
      document.documentElement,
      `::view-transition-group(${name})`,
    )
    expect(group.overflowY).toBe('clip')
    expect(group.overflowX).toBe('visible')

    transition.skipTransition()
    await done
    expect(scroller.style.viewTransitionName).toBe('')
    expect(scroller.scrollTop).toBeGreaterThan(0)
  })

  test('a newer call carries on from where the running one is drawn', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    const top = getElement('#top')
    const startViewTransition = vi.spyOn(document, 'startViewTransition')

    const first = scrollIntoView(target, {
      block: 'start',
      duration: 2000,
      easing: 'linear',
    })
    await runningTransition(startViewTransition).ready
    await new Promise((resolve) => setTimeout(resolve, 300))
    const lag = translateOf('::view-transition-new(root)')
    expect(lag.y).toBeGreaterThan(0)

    const second = scrollIntoView(top, { block: 'start', duration: 2000 })
    const transition = runningTransition(startViewTransition)
    await transition.ready
    // The old snapshot (at the first call's destination) starts where the
    // first call had drawn it, instead of jumping back to 0
    const oldStart = translateOf('::view-transition-old(root)')
    expect(oldStart.y).toBeGreaterThan(0)

    transition.skipTransition()
    await expect(first).resolves.toEqual(expect.any(Array))
    await expect(second).resolves.toEqual(expect.any(Array))
    expectApprox(window.scrollY, top.offsetTop, 2, 'window.scrollY')
  })

  test('lands on the target with scroll-behavior: smooth in CSS', async () => {
    render(tallPage, 'html { scroll-behavior: smooth }')
    const target = getElement('#target')

    await scrollIntoView(target, { block: 'start', duration: 50 })

    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
  })

  test('rejects with the abort reason and still lands on the target', async () => {
    render(tallPage, '')
    const target = getElement('#target')
    const controller = new AbortController()

    const done = scrollIntoView(target, {
      block: 'start',
      duration: 1000,
      signal: controller.signal,
    })
    controller.abort()

    await expect(done).rejects.toSatisfy(
      (error: unknown) => (error as Error).name === 'AbortError',
    )
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expectApprox(window.scrollY, target.offsetTop, 2, 'window.scrollY')
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
