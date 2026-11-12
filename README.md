# scroll-into-view-transition

A TypeScript library starter scaffolded with Vite+ 1.6.0's `vite:library` template.

## Development

Use Node.js `^22.18.0`, `^24.11.0`, or `>=26.0.0`. No global Vite+ installation is required:

```sh
npm install
npm exec -- vp check
npm exec -- vp test
npm exec -- vp pack
```

`vp pack` generates the library and TypeScript declarations in `dist/`.
The included source and test are starter examples, ready to replace with the library API.

Run package scripts or configured tasks with `npm exec -- vp run <task>`.
For example, `npm exec -- vp run dev` watches and rebuilds this library, and
`npm exec -- vp run build` packages it.

`npm exec -- vp dev` starts Vite's development server when an application or
HTML demo entry is added; this library-only template does not include one.

With a global `vp` installation, use `vp install`, `vp check`, `vp test`,
`vp pack`, and `vp run <task>` directly.
