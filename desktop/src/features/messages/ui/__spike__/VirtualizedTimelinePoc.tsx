/**
 * SPIKE ONLY — Phase 2 virtualization feasibility proof-of-concept.
 *
 * This is NOT wired into the live `MessageTimeline` and is NOT ship-ready. It
 * exists to demonstrate the integration SHAPE of `@tanstack/react-virtual`
 * against the real main-timeline constraints, and to make the three required
 * proof points concrete in code rather than prose:
 *
 *   1. Sticky-bottom autoscroll      -> `virtualizer.scrollToIndex(last, end)`
 *   2. Native scroll-up prepend      -> stable `getItemKey` + the virtualizer's
 *      retention                         own scroll anchoring (NO double-rAF)
 *   3. cmd+F find / deep-link jump   -> `virtualizer.scrollToIndex(rowIndex)`
 *      to an UNMOUNTED row               via `findVirtualRowIndexForMessage`
 *
 * Variable-height rows (messages vs day dividers) are handled by
 * `measureElement` (dynamic measurement), which is exactly why react-virtual is
 * the lean over react-window — see FEASIBILITY.md.
 */

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { TimelineMessage } from "@/features/messages/types";
import {
  buildVirtualTimelineRows,
  findVirtualRowIndexForMessage,
} from "@/features/messages/lib/buildVirtualTimelineRows";

type VirtualizedTimelinePocProps = {
  messages: TimelineMessage[];
  /** Find-in-page / deep-link target. Drives a programmatic scroll to a row that may be unmounted. */
  scrollToMessageId?: string | null;
  /** Whether to keep pinned to the newest message as it arrives (sticky-bottom). */
  stickToBottom?: boolean;
  renderMessage: (message: TimelineMessage) => React.ReactNode;
  renderDayDivider: (headingTimestamp: number) => React.ReactNode;
};

// Initial guesses only — `measureElement` corrects to real height after paint.
const ESTIMATED_MESSAGE_HEIGHT = 64;
const ESTIMATED_DIVIDER_HEIGHT = 32;
const OVERSCAN = 8;

export function VirtualizedTimelinePoc({
  messages,
  scrollToMessageId,
  stickToBottom = true,
  renderMessage,
  renderDayDivider,
}: VirtualizedTimelinePocProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Flat, index-addressable rows (dividers + messages) off the SAME snapshot the
  // rows render from — the correctness property timelineSnapshot.ts documents.
  const rows = React.useMemo(
    () => buildVirtualTimelineRows(messages),
    [messages],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      rows[index]?.kind === "day-divider"
        ? ESTIMATED_DIVIDER_HEIGHT
        : ESTIMATED_MESSAGE_HEIGHT,
    // Stable per-row identity. THIS is what lets a top-prepend (older page)
    // retain scroll position natively: surviving rows keep their key, so the
    // measurement cache survives and the virtualizer re-anchors itself. No
    // before/after scrollHeight delta math, no double-rAF correction.
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: OVERSCAN,
  });

  // (1) Sticky-bottom autoscroll: when a new latest row arrives and we're
  // pinned, jump to the last row aligned to the bottom edge. Replaces the
  // bespoke scrollTop-locking manager's `scrollToBottom`.
  const lastRowIndex = rows.length - 1;
  React.useEffect(() => {
    if (!stickToBottom || lastRowIndex < 0) {
      return;
    }
    virtualizer.scrollToIndex(lastRowIndex, { align: "end" });
  }, [lastRowIndex, stickToBottom, virtualizer]);

  // (3) cmd+F find / deep-link jump to a possibly-UNMOUNTED row. The virtualizer
  // scrolls the row into existence then aligns it — the in-app-search path that
  // replaces native browser find (which can't see unmounted rows).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the target changes
  React.useEffect(() => {
    if (!scrollToMessageId) {
      return;
    }
    const rowIndex = findVirtualRowIndexForMessage(
      rows,
      scrollToMessageId,
      messages,
    );
    if (rowIndex === -1) {
      // Target not in this snapshot yet — bail; the next snapshot drives it.
      return;
    }
    virtualizer.scrollToIndex(rowIndex, { align: "center" });
  }, [scrollToMessageId, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      // Single scroll container the virtualizer OWNS. The current bespoke
      // manager owns this same div via scrollContainerRef — they cannot coexist;
      // the virtualizer must replace it (see FEASIBILITY.md, autoscroll section).
      className="h-full overflow-y-auto [overflow-anchor:none]"
    >
      <div
        // Spacer sized to the full virtual height; rows are absolutely
        // positioned within it at their measured offsets.
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) {
            return null;
          }
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              // Dynamic measurement: each row reports its real height back, so
              // variable-height messages AND dividers are handled without a
              // fixed row-height assumption.
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {row.kind === "day-divider"
                ? renderDayDivider(row.headingTimestamp)
                : renderMessage(messages[row.messageIndex])}
            </div>
          );
        })}
      </div>
    </div>
  );
}
