import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSlaBreached } from "@/lib/useSlaBreached";

const NOW = new Date("2026-09-30T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("useSlaBreached", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("is true immediately for a room that already waited over 5 minutes", () => {
    const { result } = renderHook(() => useSlaBreached(ago(6 * 60_000), true));
    expect(result.current).toBe(true);
  });

  it("flips to true live when the 5 minute deadline passes", () => {
    const { result } = renderHook(() => useSlaBreached(ago(4 * 60_000 + 50_000), true));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(true);
  });

  it("stays false when tracking is disabled", () => {
    const { result } = renderHook(() => useSlaBreached(ago(10 * 60_000), false));
    expect(result.current).toBe(false);
  });

  it("stays false for an unparseable timestamp", () => {
    const { result } = renderHook(() => useSlaBreached("garbage", true));
    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(result.current).toBe(false);
  });

  it("clears its timer on unmount", () => {
    const { unmount } = renderHook(() => useSlaBreached(ago(60_000), true));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
