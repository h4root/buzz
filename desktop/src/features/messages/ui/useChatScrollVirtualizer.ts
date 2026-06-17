import { type Virtualizer, useVirtualizer } from "@tanstack/react-virtual";
import * as React from "react";

export type ChatVirtualizer = Virtualizer<HTMLElement, Element>;

/**
 * Single scroll owner for the chat surfaces (main timeline + thread pane).
 *
 * The hard scroll behaviors are owned by `@tanstack/react-virtual` (over
 * `virtual-core@3.17.0`), NOT hand-built here — that is the whole point of the
 * migration off the manual scroll manager:
 *
 *   - **Anchored prepend** (load-older holds the viewport): `anchorTo: "end"`.
 *     On a prepend the library captures the bottom anchor's key + relative
 *     offset and re-applies it after the new rows measure, so the viewport
 *     does not jump. This is the ResizeObserver-during-prepend race killed at
 *     the root.
 *   - **Bottom-stick during a burst**: `followOnAppend`. While pinned to the
 *     end the library re-scrolls to end on append, surviving measurement
 *     settle — no per-frame manual re-pin.
 *   - **Deep-link settle** (`scrollToIndex`): the library's internal
 *     reconcile loop re-targets the index until the offset is stable once the
 *     never-before-measured target row measures.
 *
 * What the library does NOT own — and this hook does:
 *
 *   - **Short-channel bottom-align pad.** A 2-3 message channel must sit at the
 *     bottom of the viewport. The virtualizer lays rows from the top, so we add
 *     a top pad of `max(0, viewportHeight - totalSize)`. It is recomputed off
 *     the LIVE `getTotalSize()` on every measurement pass (via `onChange`) so
 *     it collapses to 0 the instant content exceeds the viewport — see the
 *     ordering note below.
 */

export type ChatScrollVirtualizerOptions = {
  /** Number of flat virtual items. */
  count: number;
  /** Scroll container the surface owns (timeline/thread both own their own). */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Stable per-item key — byte-identical to the legacy render keys. */
  getItemKey: (index: number) => string;
  /** Estimated row height (px) before measurement. */
  estimateSize?: number;
  /** Rows rendered outside the viewport on each side. */
  overscan?: number;
  /**
   * Bottom-stick mode. The main timeline and thread pane both want to follow
   * new messages, so both pass `"auto"`; pass `false` to disable following.
   */
  followOnAppend?: boolean | "auto" | "smooth" | "instant";
};

export type ChatScrollVirtualizer = {
  virtualizer: ChatVirtualizer;
  /**
   * Top padding (px) that bottom-aligns a channel whose content is shorter
   * than the viewport. Apply it to the row spacer's `paddingTop`. Always `0`
   * once content fills the viewport.
   */
  topPad: number;
};

export function useChatScrollVirtualizer({
  count,
  scrollRef,
  getItemKey,
  estimateSize = 80,
  overscan = 6,
  followOnAppend = "auto",
}: ChatScrollVirtualizerOptions): ChatScrollVirtualizer {
  // Read the element lazily so the virtualizer binds once the ref attaches;
  // capturing `ref.current` at render time would freeze it at the first-render
  // `null` (mirrors VirtualizedList).
  const getScrollElement = React.useCallback(
    () => scrollRef.current,
    [scrollRef],
  );

  const [topPad, setTopPad] = React.useState(0);

  // Recompute the short-channel pad off the LIVE total whenever a row's
  // measured size changes. virtual-core fires `onChange` directly from
  // `resizeItem` on any size delta (not only on a visible-range change), which
  // is exactly when `getTotalSize()` moves — so a short channel whose rows
  // measure taller/shorter than the estimate re-pads with the settled total.
  // Running it here, before paint and before the library re-applies its
  // end-anchoring/follow in the same pass, orders "recompute pad -> re-pin
  // bottom" and avoids a one-frame sliver when a short channel grows past the
  // viewport.
  const recomputePad = React.useCallback(
    (instance: ChatVirtualizer) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) {
        return;
      }
      const pad = Math.max(0, scrollEl.clientHeight - instance.getTotalSize());
      setTopPad((prev) => (prev === pad ? prev : pad));
    },
    [scrollRef],
  );

  const virtualizer = useVirtualizer({
    count,
    getScrollElement,
    estimateSize: () => estimateSize,
    getItemKey,
    overscan,
    // Hold the viewport on prepend and pin to the bottom anchor for follow —
    // the two library-native behaviors that replace the manual scroll manager.
    anchorTo: "end",
    followOnAppend,
    onChange: recomputePad,
  });

  // The pad also depends on the viewport height, which `onChange` does not
  // track — a window/pane resize that changes `clientHeight` without resizing a
  // row would leave a short channel's pad stale. Observe the container so the
  // bottom-align holds across resizes too.
  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const observer = new ResizeObserver(() => recomputePad(virtualizer));
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollRef, recomputePad, virtualizer]);

  return { virtualizer, topPad };
}
