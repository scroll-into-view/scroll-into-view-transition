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

import {
  applyScroll,
  prefersReducedMotion,
  scrollWithViewTransition,
  supportsViewTransitions,
} from './view-transition.ts'

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
   * available. `'auto'` and `'instant'` jump instantly.
   * @default 'smooth'
   */
  behavior?: ScrollBehavior
  /**
   * How long the view-transition scroll animation runs, in milliseconds.
   * `0` jumps instantly. Unused when the library falls back to an instant
   * scroll.
   * @default 400
   */
  duration?: number
  /**
   * CSS `animation-timing-function` for the view-transition scroll animation.
   * Values the browser doesn't support fall back to the default ease-out
   * curve.
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

const isValidEasing = (easing: string): boolean => {
  try {
    return CSS.supports('animation-timing-function', easing)
  } catch {
    return false
  }
}

// `AbortSignal.reason` is newer than `AbortSignal` itself
const abortReason = (signal: AbortSignal): unknown =>
  signal.reason !== undefined
    ? signal.reason
    : Object.assign(new Error('The scroll was aborted'), { name: 'AbortError' })

const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal && signal.aborted) {
    throw abortReason(signal)
  }
}

const scrollSmoothly = async (
  actions: ScrollAction[],
  options: StandardBehaviorOptions,
): Promise<ScrollAction[]> => {
  const duration =
    options.duration === undefined ? DEFAULT_DURATION : options.duration
  if (!supportsViewTransitions() || prefersReducedMotion() || !(duration > 0)) {
    applyScroll(actions)
    return actions
  }
  const easing =
    options.easing !== undefined && isValidEasing(options.easing)
      ? options.easing
      : DEFAULT_EASING
  await scrollWithViewTransition(actions, {
    duration,
    easing,
    signal: options.signal,
  })
  throwIfAborted(options.signal)
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

  if (options.behavior === 'auto' || options.behavior === 'instant') {
    applyScroll(actions)
    return Promise.resolve(actions)
  }

  return scrollSmoothly(actions, options)
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
