import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{
      target,
      contentRect: { width: 1200, height: 760, top: 0, left: 0, right: 1200, bottom: 760, x: 0, y: 0, toJSON: () => ({}) },
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: []
    }], this);
  }
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver;
Object.defineProperty(window, "DOMMatrixReadOnly", {
  configurable: true,
  value: class {
    m22 = 1;
  }
});

afterEach(cleanup);
