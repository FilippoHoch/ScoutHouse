import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useEventLive } from "../src/shared/live";

vi.mock("../src/shared/auth", () => ({
  useAuth: () => ({ accessToken: "token", status: "authenticated", user: null })
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState = MockEventSource.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  dispatchMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }

  emitOpen() {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.(new Event("open"));
  }
}

describe("useEventLive", () => {
  const originalEventSource = global.EventSource;

  beforeAll(() => {
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterAll(() => {
    (globalThis as unknown as { EventSource?: typeof EventSource }).EventSource = originalEventSource;
  });

  beforeEach(() => {
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("invalidates queries when SSE messages arrive", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(() => useEventLive(42), { wrapper });
    const instance = MockEventSource.instances.at(-1);
    expect(instance).toBeDefined();

    act(() => {
      instance?.emitOpen();
    });

    expect(result.current.mode).toBe("sse");

    act(() => {
      instance?.dispatchMessage({ type: "candidate_updated", event_id: 42, payload: { event_id: 42 } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["event", 42] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["event-summary", 42] });

    unmount();
    invalidateSpy.mockRestore();
    queryClient.clear();
  });

  it("falls back to polling when SSE errors", () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, unmount } = renderHook(() => useEventLive(7), { wrapper });
    const instance = MockEventSource.instances.at(-1);
    expect(instance).toBeDefined();

    act(() => {
      instance?.emitError();
    });

    expect(result.current.mode).toBe("polling");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["event", 7] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["event-summary", 7] });

    unmount();
    invalidateSpy.mockRestore();
    queryClient.clear();
    vi.useRealTimers();
  });
});
