import { expect } from 'vite-plus/test'

/**
 * Same check as web-platform-tests' `assert_approx_equals`
 */
export function expectApprox(
  actual: number,
  expected: number,
  epsilon: number,
  description: string,
): void {
  expect(
    Math.abs(actual - expected),
    `${description}: ${actual} should be within ${epsilon} of ${expected}`,
  ).toBeLessThanOrEqual(epsilon)
}

/**
 * Renders the markup and styles of a test page into the test document
 */
export function render(html: string, css: string): void {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  document.body.innerHTML = html
}

export function getElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) {
    throw new Error(`No element matches ${selector}`)
  }
  return element
}

/**
 * Makes the test document behave like a top-level page.
 *
 * Vitest runs browser tests inside an iframe, and compute-scroll-into-view
 * treats content that overflows its frame as scrollable (`isHiddenByFrame`),
 * so an overflowing `<body>` would get scrolled instead of the window.
 */
export function hideFrameElement(): void {
  Object.defineProperty(window, 'frameElement', {
    configurable: true,
    get: () => null,
  })
}

export function mockPrefersReducedMotion(matches: boolean): () => void {
  const original = window.matchMedia.bind(window)
  window.matchMedia = ((query: string) => {
    if (query === '(prefers-reduced-motion: reduce)') {
      return {
        matches,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false
        },
      } as MediaQueryList
    }
    return original(query)
  }) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}
