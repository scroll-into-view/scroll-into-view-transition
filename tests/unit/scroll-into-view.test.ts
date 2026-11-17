import {
  compute,
  type Middleware,
  type ScrollAction,
} from 'compute-scroll-into-view'
import {
  boundary,
  onlyIfNeeded,
  skipOverflowHiddenElements,
} from 'compute-scroll-into-view/middleware'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

import scrollIntoView from '../../src/index.ts'

const middleware = (name: string): Middleware => ({ name, fn: () => ({}) })

vi.mock('compute-scroll-into-view', () => ({
  compute: vi.fn<typeof compute>(() => []),
}))
vi.mock('compute-scroll-into-view/middleware', () => ({
  boundary: vi.fn<typeof boundary>(() => middleware('boundary')),
  onlyIfNeeded: vi.fn<typeof onlyIfNeeded>(() => middleware('onlyIfNeeded')),
  skipOverflowHiddenElements: vi.fn<typeof skipOverflowHiddenElements>(() =>
    middleware('skipOverflowHiddenElements'),
  ),
}))

const computeMock = vi.mocked(compute)
const boundaryMock = vi.mocked(boundary)

const middlewareNames = () =>
  computeMock.mock.calls[0]?.[1]?.middleware?.map(({ name }) => name)

const createTarget = (): HTMLDivElement => {
  const target = document.createElement('div')
  document.body.append(target)
  return target
}

const createScrollable = () => {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: 0,
  })
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: 0,
  })
  return el
}

const mockActions = () => {
  const first = createScrollable()
  const second = createScrollable()
  const scrollActions: ScrollAction[] = [
    { el: first, top: 10, left: 20 },
    { el: second, top: 30, left: 40 },
  ]
  computeMock.mockReturnValue(scrollActions)
  return { scrollActions, elements: [first, second] }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  computeMock.mockReset()
  computeMock.mockReturnValue([])
  boundaryMock.mockReset()
  boundaryMock.mockImplementation(() => middleware('boundary'))
})

describe('targets that are not in the document', () => {
  test('resolves to [] for disconnected targets', async () => {
    const target = document.createElement('div')

    await expect(scrollIntoView(target)).resolves.toEqual([])
    expect(computeMock).not.toHaveBeenCalled()
  })

  test('resolves to [] for targets connected to another document', async () => {
    const otherDocument = document.implementation.createHTMLDocument()
    const target = otherDocument.createElement('div')
    otherDocument.body.append(target)

    expect(target.isConnected).toBe(true)
    await expect(scrollIntoView(target)).resolves.toEqual([])
    expect(computeMock).not.toHaveBeenCalled()
  })

  test('scrolls targets inside a shadow root', async () => {
    const host = createTarget()
    const target = document.createElement('div')
    host.attachShadow({ mode: 'open' }).append(target)

    await scrollIntoView(target, { behavior: 'auto' })

    expect(computeMock).toHaveBeenCalledOnce()
    expect(computeMock).toHaveBeenCalledWith(target, expect.any(Object))
  })
})

describe('options', () => {
  const start = { block: 'start', inline: 'nearest', middleware: [] }
  const end = { block: 'end', inline: 'nearest', middleware: [] }

  test.each([
    ['omitted', () => scrollIntoView(createTarget()), start],
    ['undefined', () => scrollIntoView(createTarget(), undefined), start],
    [
      'null',
      // `null` isn't in the types, but behaves like the spec's default
      () => scrollIntoView(createTarget(), null as unknown as boolean),
      start,
    ],
    ['true', () => scrollIntoView(createTarget(), true), start],
    ['false', () => scrollIntoView(createTarget(), false), end],
    ['{}', () => scrollIntoView(createTarget(), {}), start],
  ])('%s computes the spec default alignment', async (_, call, expected) => {
    await call()

    expect(computeMock).toHaveBeenCalledOnce()
    expect(computeMock.mock.calls[0]?.[1]).toEqual(expected)
  })

  test('passes only the spec options and the middleware on to compute', async () => {
    const target = createTarget()

    await scrollIntoView(target, {
      behavior: 'auto',
      block: 'center',
      inline: 'end',
      container: 'nearest',
      scroll: 'if-needed',
      boundary: document.body,
      skipOverflowHiddenElements: true,
    })

    expect(computeMock).toHaveBeenCalledExactlyOnceWith(target, {
      block: 'center',
      inline: 'end',
      container: 'nearest',
      middleware: [
        expect.objectContaining({ name: 'boundary' }),
        expect.objectContaining({ name: 'skipOverflowHiddenElements' }),
        expect.objectContaining({ name: 'onlyIfNeeded' }),
      ],
    })
  })
})

describe('middleware', () => {
  test('is empty by default', async () => {
    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      scroll: 'always',
      boundary: null,
      skipOverflowHiddenElements: false,
    })

    expect(middlewareNames()).toEqual([])
  })

  test("scroll: 'if-needed' adds onlyIfNeeded()", async () => {
    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      scroll: 'if-needed',
    })

    expect(middlewareNames()).toEqual(['onlyIfNeeded'])
  })

  test("scrollMode: 'if-needed' adds onlyIfNeeded()", async () => {
    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      scrollMode: 'if-needed',
    })

    expect(middlewareNames()).toEqual(['onlyIfNeeded'])
  })

  test('scroll wins when scrollMode is also set', async () => {
    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      scroll: 'always',
      scrollMode: 'if-needed',
    })

    expect(middlewareNames()).toEqual([])
  })

  test('user middleware runs before onlyIfNeeded()', async () => {
    const custom = { name: 'custom', fn: () => ({}) }

    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      scroll: 'if-needed',
      boundary: document.body,
      skipOverflowHiddenElements: true,
      middleware: [custom],
    })

    expect(middlewareNames()).toEqual([
      'boundary',
      'skipOverflowHiddenElements',
      'custom',
      'onlyIfNeeded',
    ])
  })

  test.each([
    ['an element', document.documentElement],
    ['a callback', (parent: Element) => parent !== document.body],
  ])('boundary as %s adds boundary(boundary)', async (_, option) => {
    await scrollIntoView(createTarget(), { behavior: 'auto', boundary: option })

    expect(boundaryMock).toHaveBeenCalledExactlyOnceWith(option)
    expect(middlewareNames()).toEqual(['boundary'])
  })

  test('skipOverflowHiddenElements adds skipOverflowHiddenElements()', async () => {
    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      skipOverflowHiddenElements: true,
    })

    expect(middlewareNames()).toEqual(['skipOverflowHiddenElements'])
  })

  test('a custom behavior gets the actions after middleware has run', () => {
    const { scrollActions } = mockActions()
    const behavior = vi.fn<(received: ScrollAction[]) => void>()

    scrollIntoView(createTarget(), { behavior, scroll: 'if-needed' })

    expect(middlewareNames()).toEqual(['onlyIfNeeded'])
    expect(behavior).toHaveBeenCalledExactlyOnceWith(scrollActions)
  })
})

describe('scrolling', () => {
  test('behavior: auto scrolls every element that compute returns', async () => {
    const { elements } = mockActions()

    await scrollIntoView(createTarget(), { behavior: 'auto' })

    expect(elements[0]?.scrollTop).toBe(10)
    expect(elements[0]?.scrollLeft).toBe(20)
    expect(elements[1]?.scrollTop).toBe(30)
    expect(elements[1]?.scrollLeft).toBe(40)
  })

  test('behavior: instant scrolls without a view transition', async () => {
    const { elements } = mockActions()
    const startViewTransition = vi.fn<() => never>()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: startViewTransition,
    })

    try {
      await scrollIntoView(createTarget(), { behavior: 'instant' })
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
    }

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(elements[0]?.scrollTop).toBe(10)
    expect(elements[1]?.scrollTop).toBe(30)
  })

  test('beforeScroll can rewrite actions', async () => {
    const { elements } = mockActions()

    await scrollIntoView(createTarget(), {
      behavior: 'auto',
      beforeScroll: (actions: ScrollAction[]) =>
        actions.map((action: ScrollAction) => ({
          el: action.el,
          top: action.top + 5,
          left: action.left + 5,
        })),
    })

    expect(elements[0]?.scrollTop).toBe(15)
    expect(elements[0]?.scrollLeft).toBe(25)
  })

  test('falls back to an instant scroll without View Transitions', async () => {
    const { elements } = mockActions()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    try {
      await scrollIntoView(createTarget(), {
        behavior: 'smooth',
        duration: 200,
      })
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition')
    }

    expect(elements[0]?.scrollTop).toBe(10)
    expect(elements[1]?.scrollTop).toBe(30)
  })

  test('falls back to an instant scroll when prefers-reduced-motion is set', async () => {
    const { elements } = mockActions()
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false
        },
      }) as MediaQueryList) as typeof window.matchMedia

    try {
      await scrollIntoView(createTarget(), { behavior: 'smooth' })
    } finally {
      window.matchMedia = original
    }

    expect(elements[0]?.scrollTop).toBe(10)
    expect(elements[1]?.scrollTop).toBe(30)
  })

  test('a custom behavior gets the actions instead of scrolling', () => {
    const { scrollActions, elements } = mockActions()
    const target = createTarget()
    const behavior = vi.fn<(received: ScrollAction[]) => number>(
      (received) => received.length,
    )

    const result = scrollIntoView(target, { behavior, block: 'center' })

    expect(result).toBe(2)
    expect(computeMock).toHaveBeenCalledWith(target, {
      block: 'center',
      middleware: [],
    })
    expect(behavior).toHaveBeenCalledExactlyOnceWith(scrollActions)
    expect(elements[0]?.scrollTop).toBe(0)
  })

  test('rejects when the signal is already aborted', async () => {
    mockActions()
    const controller = new AbortController()
    controller.abort()

    await expect(
      scrollIntoView(createTarget(), {
        behavior: 'auto',
        signal: controller.signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name: string }).name === 'AbortError',
    )
  })
})
