import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Clean up RTL between tests
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// Polyfill matchMedia (needed by Radix UI Dialog)
beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (!window.scrollTo) {
    window.scrollTo = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

// Silence console.info / console.warn in tests unless VERBOSE=1
const origInfo = console.info;
const origWarn = console.warn;
beforeAll(() => {
  if (!process.env.VERBOSE) {
    console.info = (...args: any[]) => {
      // Only show errors containing "Error" or "FAIL"
      const joined = args.join(" ");
      if (/FAIL|error/i.test(joined)) origInfo(...args);
    };
    console.warn = (...args: any[]) => {
      const joined = args.join(" ");
      if (/FAIL|error/i.test(joined)) origWarn(...args);
    };
  }
});
