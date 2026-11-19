---
'scroll-into-view-transition': minor
---

Add `scrollIntoView(target, options)`. It scrolls with the CSS View Transitions API by default and returns a Promise that resolves when scrolling is done.

It accepts the same options as `scroll-into-view-if-needed` (`block`, `inline`, `container`, `scroll: 'if-needed'`, `middleware`, `boundary`, and friends), plus `duration`, `easing`, `beforeScroll` and `signal`. CSS `@keyframes` on the view transition's snapshots play the motion. Fixed and sticky elements stay in place, nested scroll containers are clipped, and a call made while another is running continues from where the running one is drawn. Browsers without View Transitions, `prefers-reduced-motion: reduce`, and `behavior: 'auto'` jump to the final position instantly and still resolve the Promise. Middleware helpers are available from `scroll-into-view-transition/middleware`.
