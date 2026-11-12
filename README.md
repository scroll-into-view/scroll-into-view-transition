# scroll-into-view-transition

A TypeScript library starter scaffolded with Vite+ 1.6.0's `vite:library` template.

## Development

Use Node.js `^22.18.0`, `^24.11.0`, or `>=26.0.0`. No global Vite+ installation is required:

```sh
pnpm install
pnpm vp check
pnpm vp test
pnpm vp pack
```

`vp pack` generates the library and TypeScript declarations in `dist/`.
The included source and test are starter examples, ready to replace with the library API.

Run package scripts or configured tasks with `pnpm vp run <task>`.
For example, `pnpm vp run dev` watches and rebuilds this library, and
`pnpm vp run build` packages it.

`pnpm vp dev` starts Vite's development server when an application or
HTML demo entry is added; this library-only template does not include one.

With a global `vp` installation, use `vp install`, `vp check`, `vp test`,
`vp pack`, and `vp run <task>` directly.
