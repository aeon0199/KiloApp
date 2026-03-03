import "@testing-library/jest-dom/vitest";

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = MockResizeObserver;
}

class MockEventSource {
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.onopen?.(new Event("open"));
    }, 0);
  }

  close(): void {}
}

if (!globalThis.EventSource) {
  // @ts-expect-error mock EventSource for tests
  globalThis.EventSource = MockEventSource;
}
