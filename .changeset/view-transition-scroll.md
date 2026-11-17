---
'scroll-into-view-transition': minor
---

Add `scrollIntoView(target, options)` that scrolls with the CSS View Transitions API by default and returns a Promise that resolves when scrolling is done.

It accepts the same options as `scroll-into-view-if-needed` (`block`, `inline`, `container`, `scroll: 'if-needed'`, `boundary`, middleware, and friends), plus `duration` and `easing` for the transition. Browsers without View Transitions, and users with `prefers-reduced-motion: reduce`, jump to the final position instantly and still resolve the Promise. Middleware helpers are available from `scroll-into-view-transition/middleware`.
