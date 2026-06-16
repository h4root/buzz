import * as React from "react";

type UseLoadOlderOnScrollOptions = {
  fetchOlder?: () => Promise<void>;
  hasOlderMessages: boolean;
  isLoading: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * Triggers `fetchOlder` when a sentinel element near the top of the scroll
 * container enters the viewport, then re-arms once the fetch settles.
 *
 * No scroll-position restoration: the virtualizer keys every row by stable
 * identity, so when an older page splices in at the top the surviving rows keep
 * their measurement and the viewport re-anchors natively. The old
 * `previousHeight`/`previousScrollTop` snapshot + double-`requestAnimationFrame`
 * `scrollTop` correction is GONE — stable-key retention replaces it (see
 * `buildVirtualTimelineRows`).
 */
export function useLoadOlderOnScroll({
  fetchOlder,
  hasOlderMessages,
  isLoading,
  scrollContainerRef,
  sentinelRef,
}: UseLoadOlderOnScrollOptions) {
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (
      !sentinel ||
      !container ||
      !fetchOlder ||
      isLoading ||
      !hasOlderMessages
    ) {
      return;
    }

    let disposed = false;
    let currentObserver: IntersectionObserver | null = null;

    const observe = () => {
      if (disposed) {
        return;
      }

      currentObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting || disposed) {
            return;
          }

          currentObserver?.disconnect();

          void fetchOlder().then(() => {
            // Re-arm for the next page. The virtualizer holds scroll position
            // across the prepend on its own, so there is nothing to restore.
            observe();
          });
        },
        { root: container, rootMargin: "200px 0px 0px 0px" },
      );

      currentObserver.observe(sentinel);
    };

    observe();
    return () => {
      disposed = true;
      currentObserver?.disconnect();
    };
  }, [
    fetchOlder,
    hasOlderMessages,
    isLoading,
    scrollContainerRef,
    sentinelRef,
  ]);
}
