# scroll-into-view-transition

## 0.2.0

### Minor Changes

- [#14](https://github.com/scroll-into-view/scroll-into-view-transition/pull/14) [`017fc62`](https://github.com/scroll-into-view/scroll-into-view-transition/commit/017fc6231431b15501f74e729b42a83df21c3806) Thanks [@stipsan](https://github.com/stipsan)! - Add `scrollIntoView(target, options)`. It scrolls with the CSS View Transitions API by default and returns a Promise that resolves when scrolling is done.
  
  It accepts the same options as `scroll-into-view-if-needed` (`block`, `inline`, `container`, `scroll: 'if-needed'`, `middleware`, `boundary`, and friends), plus `duration`, `easing`, `beforeScroll` and `signal`. CSS `@keyframes` on the view transition's snapshots play the motion. Fixed and sticky elements stay in place, nested scroll containers are clipped, and a call made while another is running continues from where the running one is drawn. Browsers without View Transitions, `prefers-reduced-motion: reduce`, and `behavior: 'auto'` jump to the final position instantly and still resolve the Promise. Middleware helpers are available from `scroll-into-view-transition/middleware`.

## 0.1.2

### Patch Changes

- [#11](https://github.com/scroll-into-view/scroll-into-view-transition/pull/11) [`035896c`](https://github.com/scroll-into-view/scroll-into-view-transition/commit/035896c020aefef57be321e275053a281aedb65e) Thanks [@stipsan](https://github.com/stipsan)! - Declare the supported browsers as [Baseline 2019](https://web.dev/baseline) in the `browserslist` field of `package.json`, and build for it. The bundle is compiled to ES2017 syntax, without optional chaining, nullish coalescing or optional catch binding, so it works in legacy Edge 18 and older bundlers like Webpack 4.

## 0.1.1

### Patch Changes

- [`5c07a73`](https://github.com/scroll-into-view/scroll-into-view-transition/commit/5c07a739487b035c964bcee52fb8505900f81ea5) Thanks [@stipsan](https://github.com/stipsan)! - Enable Trusted Publishing

## 0.1.0

### Minor Changes

- [#6](https://github.com/scroll-into-view/scroll-into-view-transition/pull/6) [`bade064`](https://github.com/scroll-into-view/scroll-into-view-transition/commit/bade064012a2e379f25f1f5d9e45329b1fd38240) Thanks [@tembo](https://github.com/apps/tembo)! - Initial release
