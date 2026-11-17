import browserslist from 'browserslist'
import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

// tsdown doesn't read the `browserslist` field in package.json, so it gets the oldest version of each browser
// that the field resolves to, in the esbuild-style target format
const esbuildNames: Record<string, string> = {
  and_chr: 'chrome',
  and_ff: 'firefox',
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  ios_saf: 'ios',
  opera: 'opera',
  safari: 'safari',
}
const oldest = new Map<string, number>()
for (const entry of browserslist()) {
  const [name, version] = entry.split(' ')
  const esbuildName = esbuildNames[name]
  if (!esbuildName) {
    throw new Error(`Map the browserslist name "${name}" to a tsdown target`)
  }
  // Ranges like "13.0-13.1" start with their oldest version
  const number = parseFloat(version)
  if (number < (oldest.get(esbuildName) ?? Infinity)) {
    oldest.set(esbuildName, number)
  }
}
const target = [...oldest].map(([name, version]) => `${name}${version}`)

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'typescript/switch-exhaustiveness-check': 'error',
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expectApprox'] },
      ],
    },
  },
  fmt: {
    semi: false,
    singleQuote: true,
    printWidth: 80,
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            viewport: { width: 800, height: 600 },
          },
        },
      },
    ],
  },
  pack: {
    entry: ['src/index.ts', 'src/middleware.ts'],
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    // The browserslist baseline in package.json (Baseline 2019) keeps the published bundle compiling away
    // optional chaining and nullish coalescing for Webpack 4 and other older toolchains
    // (scroll-into-view/scroll-into-view-if-needed#1235). Its oldest browser, Edge 18, supports ES2017 syntax but not
    // object rest/spread or optional catch binding, so `pnpm build` runs `es-check es2017` to enforce it.
    // es-check's checkBrowser mode can't be used instead, as it treats Edge 18 as ES5
    target,
    dts: {
      generator: 'tsgo',
    },
    exports: true,
  },
})
