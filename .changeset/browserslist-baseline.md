---
"scroll-into-view-transition": patch
---

Declare the supported browsers as [Baseline 2019](https://web.dev/baseline) in the `browserslist` field of `package.json`, and build for it. The bundle is compiled to ES2017 syntax, without optional chaining, nullish coalescing or optional catch binding, so it works in legacy Edge 18 and older bundlers like Webpack 4.
