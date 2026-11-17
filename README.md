[![npm stat](https://img.shields.io/npm/dm/scroll-into-view-transition.svg?style=flat-square)](https://npm-stat.com/charts.html?package=scroll-into-view-transition)
[![npm version](https://img.shields.io/npm/v/scroll-into-view-transition.svg?style=flat-square)](https://www.npmjs.com/package/scroll-into-view-transition)

# scroll-into-view-transition

Scroll an element into view with a Promise-based API, like
[`smooth-scroll-into-view-if-needed`](https://www.npmjs.com/package/smooth-scroll-into-view-if-needed).
It accepts the same scrolling options as
[`scroll-into-view-if-needed`](https://www.npmjs.com/package/scroll-into-view-if-needed)
(`block`, `inline`, `container`, `scroll: 'if-needed'`, `boundary`, middleware,
and friends), defaults to a smooth animation, and resolves when scrolling is
done.

The difference is how the animation is produced: instead of a
`requestAnimationFrame` loop that writes `scrollTop`/`scrollLeft` every frame,
this package scrolls once inside `document.startViewTransition` and animates the
before/after snapshots with the Web Animations API. That keeps the motion on the
browser's view-transition path.

Browsers without the View Transitions API, and users with
`prefers-reduced-motion: reduce`, still end up at the right scroll position: the
library jumps instantly and resolves the Promise. It never leaves the page
unscrolled or the Promise hanging.

## Install

```bash
npm i scroll-into-view-transition
```

The package is ESM only. In the browser you can load it from a CDN like
[esm.sh](https://esm.sh):

```html
<script type="module">
  import scrollIntoView from 'https://esm.sh/scroll-into-view-transition'
</script>
```

CommonJS code on Node.js 20.19+ or 22.12+ can still `require()` it, and the
function is on `.default`:

```js
const { default: scrollIntoView } = require('scroll-into-view-transition')
```

The published code supports [Baseline 2019](https://web.dev/baseline) browsers
(Chrome 66, Edge 18, Firefox 65 and Safari 13, and newer), as declared in the
`browserslist` field of `package.json`. It's compiled to ES2017 syntax, without
optional chaining or nullish coalescing, so it works in older bundlers like
Webpack 4 without transpiling it.

## Usage

```js
import scrollIntoView from 'scroll-into-view-transition'

const node = document.getElementById('hero')

// Smooth by default: uses a view transition when the browser supports it
await scrollIntoView(node)

// Same options as scroll-into-view-if-needed
await scrollIntoView(node, {
  scroll: 'if-needed',
  block: 'nearest',
  inline: 'nearest',
})

// Sequence scrolls by awaiting the Promise
await scrollIntoView(node, { block: 'start' })
await scrollIntoView(document.getElementById('slide-3'), { block: 'center' })
```

### How it differs from `smooth-scroll-into-view-if-needed`

|                                      | `smooth-scroll-into-view-if-needed`       | `scroll-into-view-transition`        |
| ------------------------------------ | ----------------------------------------- | ------------------------------------ |
| Animation driver                     | `requestAnimationFrame` loop              | CSS View Transitions API             |
| Default behavior                     | `smooth`                                  | `smooth`                             |
| No View Transitions / reduced motion | Still animates in JS (unless you opt out) | Instant jump, Promise still resolves |
| Custom frame easing                  | `ease(t)` function                        | CSS `easing` string                  |
| Duration default                     | `600`                                     | `400`                                |

Use this package when you want scroll motion that participates in the browser's
view-transition machinery. Prefer `smooth-scroll-into-view-if-needed` when you
need identical JS-driven easing in every browser, including those without View
Transitions.

## Browser support

Scrolling itself works wherever the published Baseline 2019 build runs. The
animated path needs [`document.startViewTransition`](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition):

- Chrome / Edge 111+
- Safari 18+
- Firefox 144+
- Opera 97+

(Can I Use / MDN as of 2026-11. Same-document view transitions became Baseline
Newly available in October 2025.)

Without that API, or when `prefers-reduced-motion: reduce` matches, the library
applies the final scroll positions immediately.

## API

### `scrollIntoView(target, [options]) => Promise`

Returns a Promise that resolves to the `ScrollAction[]` that were applied
(`{ el, top, left }` per scroll container, innermost first). It resolves to `[]`
when the target isn't connected to the document, or when nothing needs to move
(for example `scroll: 'if-needed'` while already visible).

A custom `behavior` function is returned as-is, like
`scroll-into-view-if-needed`.

Pass an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
as `signal` to cancel. If the signal aborts before or during the transition, the
Promise rejects with the signal's abort reason. A transition skipped because a
newer view transition started still resolves: the scroll update already ran.

```js
const controller = new AbortController()
addEventListener('wheel', () => controller.abort(), { once: true })

try {
  await scrollIntoView(node, { signal: controller.signal })
} catch (error) {
  if (error.name !== 'AbortError') throw error
}
```

### options

#### behavior

Type: `'auto' | 'smooth' | Function`  
Default: `'smooth'`

- `'smooth'` — view-transition animation when possible, otherwise an instant jump.
- `'auto'` — jump instantly, never starts a view transition.
- `Function` — receives the computed `ScrollAction[]` and its return value is
  returned from `scrollIntoView`, without scrolling for you.

#### duration

Type: `number`  
Default: `400`

Milliseconds for the view-transition scroll animation. Chosen to feel snappy on
the browser-driven path; unused for instant fallbacks. Set `0` to force an
instant jump even when View Transitions are available.

#### easing

Type: `string`  
Default: `'cubic-bezier(0.22, 1, 0.36, 1)'`

CSS easing used by the Web Animations API on
`::view-transition-old(...)` / `::view-transition-new(...)`. The default is an
ease-out quint curve, matching the feel of
`smooth-scroll-into-view-if-needed`'s default `ease` function.

#### scroll

Type: `'always' | 'if-needed'`  
Default: `'always'`

`'if-needed'` adds the `onlyIfNeeded()` middleware so already-visible targets
are left alone (and no view transition starts).

#### block / inline / container / middleware

Same meaning as in
[`compute-scroll-into-view`](https://github.com/scroll-into-view/compute-scroll-into-view)
and `scroll-into-view-if-needed`.

#### beforeScroll

Type: `(actions: ScrollAction[]) => ScrollAction[]`

Called with the computed actions before scrolling. Return the actions to apply:
omit entries to skip them, or change `top` / `left`.

#### boundary / skipOverflowHiddenElements / scrollMode

Deprecated convenience options, kept for parity with
`scroll-into-view-if-needed`. Prefer the middleware forms below.

## Middleware

Built-in middleware is re-exported from
`scroll-into-view-transition/middleware` (the same helpers as
`compute-scroll-into-view/middleware`):

```js
import scrollIntoView from 'scroll-into-view-transition'
import {
  boundary,
  onlyIfNeeded,
  skipOverflowHiddenElements,
} from 'scroll-into-view-transition/middleware'

await scrollIntoView(node, {
  middleware: [boundary(list), skipOverflowHiddenElements(), onlyIfNeeded()],
})
```

Put `onlyIfNeeded()` last, after middleware that changes which containers scroll
or how they are measured. `scroll: 'if-needed'` appends it for you after your
`middleware` array.

## Limitations

- **Sticky and fixed elements** are painted into the view-transition snapshots.
  While the old/new layers translate to fake a scroll, sticky/fixed boxes can
  look like they move with the content for the duration of the animation.
- **Overlapping transitions:** starting a new `scrollIntoView` while one is
  running skips the previous view transition (the browser's default). The
  earlier Promise still resolves after cleanup; the latest call wins the final
  scroll position.
- **Iframes:** scrolling is computed in the target's document. Cross-document
  iframe coordination is not handled specially.
- Nested scroll containers get a temporary `view-transition-name` for the
  transition. Avoid setting conflicting names on those elements yourself while
  a scroll is in flight.

## Related packages

- [`scroll-into-view-if-needed`](https://www.npmjs.com/package/scroll-into-view-if-needed) —
  ponyfill for `Element.scrollIntoView` options like `scroll: 'if-needed'`.
- [`smooth-scroll-into-view-if-needed`](https://www.npmjs.com/package/smooth-scroll-into-view-if-needed) —
  the same Promise API with a JS `requestAnimationFrame` smooth scroll.
- [`compute-scroll-into-view`](https://www.npmjs.com/package/compute-scroll-into-view) —
  the layout engine both packages share.
