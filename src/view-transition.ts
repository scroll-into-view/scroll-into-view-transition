import type { ScrollAction } from 'compute-scroll-into-view'

export interface TransitionOptions {
  duration: number
  easing: string
  signal?: AbortSignal
}

type Vector = { x: number; y: number }

type Layer = {
  el: Element
  name: string
  isRoot: boolean
  delta: Vector
  newStart: Vector
  oldStart: Vector
  oldEnd: Vector
}

type ActiveTransition = {
  names: Map<Element, string>
}

type Claim = { name: string; original: string; count: number }

const PREFIX = 'scroll-into-view-transition'

let counter = 0
// Overlapping calls share one name per element, and the original inline value
// is restored when the last of them finishes
const claims = new Map<Element, Claim>()
// Only the newest of our transitions is on screen, as starting one skips the
// one before it
let current: ActiveTransition | null = null

const nextId = (): number => {
  counter += 1
  return counter
}

const inlineStyle = (el: Element): CSSStyleDeclaration =>
  (el as Element & ElementCSSInlineStyle).style

const claimName = (el: Element): string => {
  const existing = claims.get(el)
  if (existing) {
    existing.count += 1
    return existing.name
  }
  const name = `${PREFIX}-${nextId()}`
  const style = inlineStyle(el)
  claims.set(el, { name, original: style.viewTransitionName, count: 1 })
  style.viewTransitionName = name
  return name
}

const releaseName = (el: Element) => {
  const claim = claims.get(el)
  if (!claim) {
    return
  }
  claim.count -= 1
  if (claim.count === 0) {
    claims.delete(el)
    inlineStyle(el).viewTransitionName = claim.original
  }
}

export const isRootScroller = (el: Element): boolean =>
  el === document.documentElement ||
  el === document.body ||
  el === document.scrollingElement

export const applyScroll = (actions: ScrollAction[]): void => {
  // `behavior: 'instant'` overrides `scroll-behavior: smooth` in CSS, which
  // would otherwise delay the scroll past the view transition's capture
  const instant = 'scrollBehavior' in document.documentElement.style
  for (const { el, top, left } of actions) {
    if (instant && typeof el.scroll === 'function') {
      el.scroll({ top, left, behavior: 'instant' })
    } else {
      el.scrollTop = top
      el.scrollLeft = left
    }
  }
}

export const supportsViewTransitions = (): boolean =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function'

const supportsTypes = (): boolean =>
  typeof ViewTransition !== 'undefined' && 'types' in ViewTransition.prototype

export const prefersReducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// The computed `translate` of a running `::view-transition-new()` is where
// that layer is drawn right now, e.g. `none`, `0px 120px` or `4px 8px 0px`
const readTranslate = (name: string): Vector => {
  const value = getComputedStyle(
    document.documentElement,
    `::view-transition-new(${name})`,
  ).translate
  if (!value || value === 'none') {
    return { x: 0, y: 0 }
  }
  const [x = '0', y = '0'] = value.split(' ')
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 }
}

const clamp = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, value))

const planLayers = (actions: ScrollAction[]): Layer[] => {
  const layers: Layer[] = []
  for (const { el, top, left } of actions) {
    const delta = { x: left - el.scrollLeft, y: top - el.scrollTop }
    if (delta.x === 0 && delta.y === 0) {
      continue
    }
    const isRoot = isRootScroller(el)
    const viewport = isRoot ? document.documentElement : el
    const previousName = current ? current.names.get(el) : undefined
    // Where a transition that's still running drew this scroller's content,
    // so a newer call carries on from there instead of jumping
    const lag = previousName ? readTranslate(previousName) : { x: 0, y: 0 }
    // The snapshots only hold what was visible before and after, so a jump
    // longer than the scrollport slides by one scrollport instead of
    // leaving a blank gap between the two
    const newStart = {
      x: clamp(delta.x + lag.x, viewport.clientWidth),
      y: clamp(delta.y + lag.y, viewport.clientHeight),
    }
    layers.push({
      el,
      name: isRoot ? 'root' : '',
      isRoot,
      delta,
      newStart,
      oldStart: lag,
      oldEnd: { x: lag.x - newStart.x, y: lag.y - newStart.y },
    })
  }
  return layers
}

// Fixed and sticky boxes don't move with the content, so they get their own
// snapshot and keep their place instead of sliding with the scroller's
const findPinnedElements = (layers: Layer[]): Element[] => {
  const scrollers = new Set(layers.map((layer) => layer.el))
  const found = new Set<Element>()
  for (const layer of layers) {
    const scope = layer.isRoot
      ? document.body || document.documentElement
      : layer.el
    for (const el of scope.querySelectorAll('*')) {
      if (found.has(el) || scrollers.has(el)) {
        continue
      }
      const style = getComputedStyle(el)
      if (
        (style.position === 'fixed' || style.position === 'sticky') &&
        style.display !== 'none' &&
        (claims.has(el) || style.viewTransitionName === 'none')
      ) {
        found.add(el)
      }
    }
  }
  return [...found]
}

const px = ({ x, y }: Vector): string => `${x}px ${y}px`

const buildStyle = (
  layers: Layer[],
  id: number,
  scope: string,
  { duration, easing }: TransitionOptions,
): string => {
  const timing = `${duration}ms ${easing}`
  const rules = [
    // Named elements that aren't scrollers, like fixed headers, morph with
    // the same timing as the scroll
    `${scope}::view-transition-group(*),${scope}::view-transition-old(*),${scope}::view-transition-new(*){animation-duration:${duration}ms;animation-timing-function:${easing}}`,
  ]
  let rootScrolls = false
  layers.forEach((layer, index) => {
    rootScrolls = rootScrolls || layer.isRoot
    const keyframes = `${PREFIX}-${id}-${index}`
    rules.push(
      `@keyframes ${keyframes}-old{from{translate:${px(layer.oldStart)}}to{translate:${px(layer.oldEnd)}}}`,
      `@keyframes ${keyframes}-new{from{translate:${px(layer.newStart)}}to{translate:0px 0px}}`,
      // Both snapshots stay opaque: the old one slides out as the new one
      // slides in, instead of the default cross-fade
      `${scope}::view-transition-old(${layer.name}){animation:${keyframes}-old ${timing} both;mix-blend-mode:normal}`,
      `${scope}::view-transition-new(${layer.name}){animation:${keyframes}-new ${timing} both;mix-blend-mode:normal}`,
    )
    if (!layer.isRoot) {
      // Clip only along the axes that scroll, so the scroller's box-shadow
      // and outline on the other axis stay visible
      const clip =
        layer.delta.x !== 0 && layer.delta.y !== 0
          ? 'overflow:clip'
          : layer.delta.y !== 0
            ? 'overflow-y:clip'
            : 'overflow-x:clip'
      rules.push(`${scope}::view-transition-group(${layer.name}){${clip}}`)
    }
  })
  if (!rootScrolls) {
    rules.push(
      `${scope}::view-transition-old(root),${scope}::view-transition-new(root){animation:none;mix-blend-mode:normal}`,
    )
  }
  return rules.join('\n')
}

const noop = () => {}

/**
 * Scrolls once inside `document.startViewTransition`, and lets CSS keyframes
 * on the `::view-transition-old()` and `::view-transition-new()` snapshots
 * play the motion. Resolves once the transition is done, or skipped.
 */
export const scrollWithViewTransition = async (
  actions: ScrollAction[],
  options: TransitionOptions,
): Promise<void> => {
  const layers = planLayers(actions)
  if (layers.length === 0) {
    return
  }

  const claimed: Element[] = []
  const active: ActiveTransition = { names: new Map() }
  for (const layer of layers) {
    if (!layer.isRoot) {
      layer.name = claimName(layer.el)
      claimed.push(layer.el)
    }
    active.names.set(layer.el, layer.name)
  }
  for (const el of findPinnedElements(layers)) {
    claimName(el)
    claimed.push(el)
  }

  const id = nextId()
  const type = `${PREFIX}-${id}`
  const withTypes = supportsTypes()
  // Scoped to this transition's type, so the rules can't leak into a newer
  // view transition that starts before this one cleans up
  const scope = withTypes
    ? `:root:active-view-transition-type(${type})`
    : ':root'
  const style = document.createElement('style')
  style.textContent = buildStyle(layers, id, scope, options)
  document.head.append(style)

  const cleanup = () => {
    if (current === active) {
      current = null
    }
    style.remove()
    for (const el of claimed) {
      releaseName(el)
    }
  }

  const update = () => applyScroll(actions)
  let transition: ViewTransition
  try {
    transition = withTypes
      ? document.startViewTransition({ update, types: [type] })
      : document.startViewTransition(update)
  } catch (error) {
    cleanup()
    applyScroll(actions)
    throw error
  }
  current = active

  const { signal } = options
  const onAbort = () => transition.skipTransition()
  if (signal) {
    signal.addEventListener('abort', onAbort)
  }

  // `ready` rejects when the transition is skipped, by `signal` or by a newer
  // view transition. The update callback still runs, so the scroll lands
  transition.ready.catch(noop)
  try {
    await transition.updateCallbackDone.catch(noop)
    await transition.finished.catch(noop)
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
    cleanup()
  }
}
