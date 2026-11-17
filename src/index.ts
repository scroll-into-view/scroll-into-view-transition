import { compute } from 'compute-scroll-into-view'
import type {
  Options as ComputeOptions,
  Middleware,
  ScrollAction,
} from 'compute-scroll-into-view'
import {
  boundary as limitToBoundary,
  onlyIfNeeded,
  skipOverflowHiddenElements as skipOverflowHidden,
} from 'compute-scroll-into-view/middleware'

/** @public */
export type { Middleware, ScrollAction }

/** @public */
export type Options<T = unknown> =
  | StandardBehaviorOptions
  | CustomBehaviorOptions<T>

/** @public */
export interface BaseOptions extends ComputeOptions {
  /**
   * `'if-needed'` only scrolls when the target isn't fully visible, like
   * `Element.scrollIntoViewIfNeeded`. `onlyIfNeeded()` is added after
   * `middleware`.
   * @default 'always'
   */
  scroll?: 'always' | 'if-needed'
  /**
   * Same as `scroll`.
   * @deprecated Use `scroll` instead. `scrollMode` will be removed in the next
   * major version.
   * @default 'always'
   */
  scrollMode?: 'always' | 'if-needed'
  /**
   * Stops scrolling at this element, or at the first parent the callback
   * returns `false` for. The boundary itself is still scrolled, its parents
   * are not.
   * @deprecated Use `middleware: [boundary(limit)]` from
   * `scroll-into-view-transition/middleware` instead. `boundary` will be
   * removed in the next major version.
   * @default null
   */
  boundary?: Element | ((parent: Element) => boolean) | null
  /**
   * Skips scrolling elements that are `overflow: hidden`.
   * @deprecated Use `middleware: [skipOverflowHiddenElements()]` from
   * `scroll-into-view-transition/middleware` instead.
   * `skipOverflowHiddenElements` will be removed in the next major version.
   * @default false
   */
  skipOverflowHiddenElements?: boolean
  /**
   * Called with the computed scroll positions before scrolling starts.
   * Return the actions to apply: leave elements out to skip them, or change
   * `top` and `left` to scroll them somewhere else.
   */
  beforeScroll?: (actions: ScrollAction[]) => ScrollAction[]
  /**
   * Stops the view transition when aborted, and rejects the returned Promise
   * with the signal's abort reason.
   */
  signal?: AbortSignal
}

/**
 * Options for the default, smooth view-transition scroll.
 * @public
 */
export interface StandardBehaviorOptions extends BaseOptions {
  /**
   * `'smooth'` (the default) animates with the View Transitions API when
   * available. `'auto'` jumps instantly.
   * @default 'smooth'
   */
  behavior?: ScrollBehavior
  /**
   * How long the view-transition scroll animation runs, in milliseconds.
   * Defaults to `400`: long enough to read as motion, shorter than a typical
   * rAF smooth-scroll loop so the browser-driven transition stays snappy.
   * Unused when the library falls back to an instant scroll.
   * @default 400
   */
  duration?: number
  /**
   * CSS easing for the view-transition scroll animation. Defaults to an
   * ease-out quint curve (`cubic-bezier(0.22, 1, 0.36, 1)`), matching the feel
   * of `smooth-scroll-into-view-if-needed`'s default `ease` function.
   * @default 'cubic-bezier(0.22, 1, 0.36, 1)'
   */
  easing?: string
}

/** @public */
export interface CustomBehaviorOptions<T = unknown> extends BaseOptions {
  behavior: CustomScrollBehaviorCallback<T>
}

/** @public */
export type CustomScrollBehaviorCallback<T = unknown> = (
  actions: ScrollAction[],
) => T

const DEFAULT_DURATION = 400
const DEFAULT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

const isStandardScrollBehavior = (
  options: unknown,
): options is StandardBehaviorOptions =>
  options === Object(options) && Object.keys(options as object).length !== 0

const isCustomScrollBehavior = <T = unknown>(
  options: unknown,
): options is CustomBehaviorOptions<T> =>
  typeof options === 'object' &&
  options !== null &&
  typeof (options as CustomBehaviorOptions<T>).behavior === 'function'

const getOptions = (options: unknown): StandardBehaviorOptions => {
  // Handle alignToTop for legacy reasons, to be compatible with the spec
  if (options === false) {
    return { block: 'end', inline: 'nearest' }
  }

  if (isStandardScrollBehavior(options)) {
    return options
  }

  // if options = {}, options = true or options = null, based on w3c web platform test
  return { block: 'start', inline: 'nearest' }
}

// No object rest or spread, which would pull helpers into the Baseline 2019 build
const getActions = (
  target: Element,
  options: StandardBehaviorOptions | CustomBehaviorOptions,
): ScrollAction[] => {
  const middleware: Middleware[] = []
  if (options.boundary) {
    middleware.push(limitToBoundary(options.boundary))
  }
  if (options.skipOverflowHiddenElements) {
    middleware.push(skipOverflowHidden())
  }
  // User middleware runs after the deprecated options and before `onlyIfNeeded()`
  if (options.middleware) {
    for (const item of options.middleware) {
      middleware.push(item)
    }
  }
  // `scroll` wins when both are set. Last, so only the scroll containers that are left decide if scrolling is needed
  const scroll = options.scroll ?? options.scrollMode
  if (scroll === 'if-needed') {
    middleware.push(onlyIfNeeded())
  }
  return compute(target, {
    block: options.block,
    inline: options.inline,
    container: options.container,
    middleware,
  })
}

// Determine if the element is part of the document (including shadow dom)
// Derived from code of Andy Desmarais
// https://terodox.tech/how-to-tell-if-an-element-is-in-the-dom-including-the-shadow-dom/
const isInDocument = (element: Node) => {
  let currentElement = element
  while (currentElement && currentElement.parentNode) {
    if (currentElement.parentNode === document) {
      return true
    } else if (currentElement.parentNode instanceof ShadowRoot) {
      currentElement = currentElement.parentNode.host
    } else {
      currentElement = currentElement.parentNode
    }
  }
  return false
}

const applyScroll = (actions: ScrollAction[]) => {
  for (const { el, top, left } of actions) {
    // Prefer property assignment over `scroll({ behavior: 'instant' })` so
    // Baseline 2019 browsers and older engine builds still jump immediately.
    el.scrollTop = top
    el.scrollLeft = left
  }
}

const prefersReducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const supportsViewTransitions = (): boolean =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function'

const isRootScroller = (el: Element): boolean => {
  const scrollingElement = document.scrollingElement
  return (
    el === document.documentElement ||
    el === document.body ||
    (scrollingElement !== null && el === scrollingElement)
  )
}

// `AbortSignal.reason` is newer than `AbortSignal` itself
const abortReason = (signal: AbortSignal): unknown =>
  signal.reason !== undefined
    ? signal.reason
    : Object.assign(new Error('The scroll was aborted'), { name: 'AbortError' })

const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) {
    throw abortReason(signal)
  }
}

type NamedScroller = {
  el: Element
  name: string
  previous: string
}

type ScrollDelta = {
  el: Element
  top: number
  left: number
  dx: number
  dy: number
  isRoot: boolean
  name: string
}

let nameCounter = 0

const nextTransitionName = (): string => {
  nameCounter += 1
  return `scroll-into-view-transition-${nameCounter}`
}

const setViewTransitionName = (el: Element, name: string): NamedScroller => {
  const style = (el as HTMLElement).style
  const previous = style.viewTransitionName
  style.viewTransitionName = name
  return { el, name, previous }
}

const restoreViewTransitionNames = (named: NamedScroller[]) => {
  for (const item of named) {
    ;(item.el as HTMLElement).style.viewTransitionName = item.previous
  }
}

const buildTransitionStyle = (names: string[]): HTMLStyleElement => {
  const style = document.createElement('style')
  const selectors: string[] = [
    '::view-transition-old(root)',
    '::view-transition-new(root)',
  ]
  const groupSelectors: string[] = ['::view-transition-group(root)']
  for (const name of names) {
    selectors.push(`::view-transition-old(${name})`)
    selectors.push(`::view-transition-new(${name})`)
    groupSelectors.push(`::view-transition-group(${name})`)
  }
  // Disable the default cross-fade, keep snapshots opaque, and clip nested
  // scroll-container groups so translating their old/new snapshots reads as a
  // scroll instead of sliding the whole box around the page.
  style.textContent = `${groupSelectors.join(',')}{overflow:clip;}
${selectors.join(',')}{animation:none;mix-blend-mode:normal;display:block;height:100%;width:100%;object-fit:none;object-position:left top;}`
  document.head.append(style)
  return style
}

const cancelViewTransitionAnimations = () => {
  for (const animation of document.getAnimations()) {
    const effect = animation.effect
    if (!(effect instanceof KeyframeEffect)) {
      continue
    }
    const pseudo = effect.pseudoElement
    if (pseudo && pseudo.startsWith('::view-transition')) {
      animation.cancel()
    }
  }
}

const animateScrollSnapshots = (
  deltas: ScrollDelta[],
  duration: number,
  easing: string,
) => {
  cancelViewTransitionAnimations()

  let rootAnimated = false
  for (const delta of deltas) {
    if (delta.name === 'root') {
      rootAnimated = true
    }
    const dx = delta.dx
    const dy = delta.dy
    // Scrolling down/right moves content up/left, so the old snapshot ends at
    // `-delta` and the new one starts at `+delta`.
    document.documentElement.animate(
      [
        { transform: 'translate(0px, 0px)', opacity: 1 },
        {
          transform: `translate(${-dx}px, ${-dy}px)`,
          opacity: 1,
        },
      ],
      {
        duration,
        easing,
        fill: 'both',
        pseudoElement: `::view-transition-old(${delta.name})`,
      },
    )
    document.documentElement.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px)`,
          opacity: 1,
        },
        { transform: 'translate(0px, 0px)', opacity: 1 },
      ],
      {
        duration,
        easing,
        fill: 'both',
        pseudoElement: `::view-transition-new(${delta.name})`,
      },
    )
  }

  // Nested-only scrolls still produce a root image pair. Keep the new root
  // visible and hide the old one so they don't stack on top of the scroller.
  if (!rootAnimated) {
    document.documentElement.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration,
      fill: 'both',
      pseudoElement: '::view-transition-old(root)',
    })
    document.documentElement.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration,
      fill: 'both',
      pseudoElement: '::view-transition-new(root)',
    })
  }
}

const planDeltas = (actions: ScrollAction[]): ScrollDelta[] => {
  const deltas: ScrollDelta[] = []
  for (const action of actions) {
    const dx = action.left - action.el.scrollLeft
    const dy = action.top - action.el.scrollTop
    if (dx === 0 && dy === 0) {
      continue
    }
    const isRoot = isRootScroller(action.el)
    deltas.push({
      el: action.el,
      top: action.top,
      left: action.left,
      dx,
      dy,
      isRoot,
      name: isRoot ? 'root' : nextTransitionName(),
    })
  }
  return deltas
}

const scrollWithViewTransition = async (
  actions: ScrollAction[],
  options: StandardBehaviorOptions,
): Promise<ScrollAction[]> => {
  const duration = options.duration ?? DEFAULT_DURATION
  const easing = options.easing ?? DEFAULT_EASING
  const signal = options.signal

  throwIfAborted(signal)

  const deltas = planDeltas(actions)
  if (deltas.length === 0) {
    return actions
  }

  // Nothing interesting to animate: jump and resolve.
  if (!supportsViewTransitions() || prefersReducedMotion() || duration <= 0) {
    applyScroll(actions)
    return actions
  }

  const named: NamedScroller[] = []
  const customNames: string[] = []
  for (const delta of deltas) {
    if (!delta.isRoot) {
      named.push(setViewTransitionName(delta.el, delta.name))
      customNames.push(delta.name)
    }
  }

  const style = buildTransitionStyle(customNames)
  let transition: ViewTransition
  try {
    throwIfAborted(signal)
    transition = document.startViewTransition(() => {
      applyScroll(actions)
    })
  } catch (error) {
    style.remove()
    restoreViewTransitionNames(named)
    // If starting the transition fails, still land on the destination.
    applyScroll(actions)
    throw error
  }

  const cleanup = () => {
    style.remove()
    restoreViewTransitionNames(named)
  }

  if (signal) {
    const onAbort = () => {
      transition.skipTransition()
    }
    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
      void transition.finished.finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
    }
  }

  try {
    await transition.ready
    throwIfAborted(signal)
    animateScrollSnapshots(deltas, duration, easing)
    await transition.finished
  } catch {
    // A skipped or interrupted transition still applied the scroll in the
    // update callback (`finished` rejects on `skipTransition()`, including
    // when a newer view transition replaces this one). Resolve unless the
    // caller aborted via `signal`.
    if (signal?.aborted) {
      throw abortReason(signal)
    }
  } finally {
    cleanup()
  }

  throwIfAborted(signal)
  // Guaranteed destination even if the update callback never ran (defensive).
  applyScroll(actions)
  return actions
}

const runStandardScroll = (
  target: Element,
  options: StandardBehaviorOptions,
): Promise<ScrollAction[]> => {
  throwIfAborted(options.signal)

  const computed = getActions(target, options)
  const actions = options.beforeScroll
    ? options.beforeScroll(computed)
    : computed

  if (options.behavior === 'auto') {
    applyScroll(actions)
    return Promise.resolve(actions)
  }

  // Default behavior is smooth (view transition when possible)
  return scrollWithViewTransition(actions, options)
}

/**
 * Scrolls the given element into view. Like
 * [`smooth-scroll-into-view-if-needed`](https://github.com/scroll-into-view/smooth-scroll-into-view-if-needed),
 * it returns a Promise that resolves when scrolling is done, and defaults to a
 * smooth animation. The animation is driven by the CSS View Transitions API
 * instead of a `requestAnimationFrame` loop. Browsers without View Transitions,
 * and users with `prefers-reduced-motion: reduce`, jump to the destination and
 * still resolve the Promise.
 * @public
 */
function scrollIntoView(
  target: Element,
  options?: StandardBehaviorOptions | boolean,
): Promise<ScrollAction[]>
/**
 * Scrolls the given element into view with a custom `behavior` callback.
 * @public
 */
function scrollIntoView<T>(
  target: Element,
  options: CustomBehaviorOptions<T>,
): T
function scrollIntoView<T = unknown>(
  target: Element,
  options?: StandardBehaviorOptions | CustomBehaviorOptions<T> | boolean,
): T | Promise<ScrollAction[]> {
  // Browsers treat targets that aren't in the dom as a no-op and so should we
  if (!target.isConnected || !isInDocument(target)) {
    if (isCustomScrollBehavior<T>(options)) {
      return options.behavior([])
    }
    return Promise.resolve([])
  }

  if (isCustomScrollBehavior<T>(options)) {
    return options.behavior(getActions(target, options))
  }

  const standardOptions = getOptions(options)
  const { signal } = standardOptions
  if (signal) {
    return new Promise<ScrollAction[]>((resolve, reject) => {
      const onAbort = () => reject(abortReason(signal))
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort)
      runStandardScroll(target, standardOptions).then(
        (actions) => {
          signal.removeEventListener('abort', onAbort)
          resolve(actions)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      )
    })
  }

  return runStandardScroll(target, standardOptions)
}

export default scrollIntoView
