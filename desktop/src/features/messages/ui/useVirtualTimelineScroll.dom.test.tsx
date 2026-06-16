import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import type * as React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Virtualizer } from "@tanstack/react-virtual";

import { buildVirtualTimelineRows } from "@/features/messages/lib/buildVirtualTimelineRows";
import type { TimelineMessage } from "@/features/messages/types";
import { useVirtualTimelineScroll } from "./useVirtualTimelineScroll";

afterEach(cleanup);

const DAY_1 = Math.floor(new Date(2026, 0, 1, 12, 0, 0).getTime() / 1000);

function message(
  overrides: Partial<TimelineMessage> & { id: string },
): TimelineMessage {
  return {
    createdAt: DAY_1,
    author: "tester",
    time: "",
    body: `body-${overrides.id}`,
    depth: 0,
    kind: 9,
    ...overrides,
  };
}

// Records scrollToIndex calls so we can assert the virtualizer is driven
// correctly. The hook never reads layout off the virtualizer directly.
function makeVirtualizer() {
  const scrollToIndex =
    mock.fn<
      (index: number, opts?: { align?: string; behavior?: string }) => void
    >();
  return {
    scrollToIndex,
    virtualizer: { scrollToIndex } as unknown as Virtualizer<
      HTMLDivElement,
      Element
    >,
  };
}

// A fake scroll container whose scroll metrics we control. `isNearBottom`
// reads scrollHeight/clientHeight/scrollTop; defaults (0) read as "at bottom".
function makeContainerRef(atBottom: boolean) {
  const el = {
    scrollHeight: atBottom ? 100 : 1000,
    clientHeight: 100,
    scrollTop: atBottom ? 0 : 0,
  } as unknown as HTMLDivElement;
  return { current: el } as React.RefObject<HTMLDivElement | null>;
}

test("on init with no deep-link target, scrolls to the last row (sticky bottom)", () => {
  const messages = [message({ id: "a" }), message({ id: "b" })];
  const rows = buildVirtualTimelineRows(messages);
  const { scrollToIndex, virtualizer } = makeVirtualizer();

  renderHook(() =>
    useVirtualTimelineScroll({
      channelId: "c1",
      isLoading: false,
      messages,
      rows,
      scrollContainerRef: makeContainerRef(true),
      virtualizer,
    }),
  );

  // layout: [div, a, b] -> last index 2
  assert.ok(scrollToIndex.mock.calls.length >= 1);
  const [index, opts] = scrollToIndex.mock.calls[0].arguments;
  assert.equal(index, rows.length - 1);
  assert.equal(opts?.align, "end");
});

test("a new latest message while pinned autoscrolls; accent uses smooth", () => {
  const initial = [message({ id: "a" })];
  const rows1 = buildVirtualTimelineRows(initial);
  const { scrollToIndex, virtualizer } = makeVirtualizer();

  const { rerender } = renderHook(
    ({ messages, rows }) =>
      useVirtualTimelineScroll({
        channelId: "c1",
        isLoading: false,
        messages,
        rows,
        scrollContainerRef: makeContainerRef(true),
        virtualizer,
      }),
    { initialProps: { messages: initial, rows: rows1 } },
  );

  scrollToIndex.mock.resetCalls();

  const next = [message({ id: "a" }), message({ id: "b", accent: true })];
  const rows2 = buildVirtualTimelineRows(next);
  act(() => {
    rerender({ messages: next, rows: rows2 });
  });

  assert.ok(scrollToIndex.mock.calls.length >= 1);
  const lastCall = scrollToIndex.mock.calls.at(-1);
  assert.equal(lastCall?.arguments[0], rows2.length - 1);
  assert.equal(lastCall?.arguments[1]?.behavior, "smooth");
});

test("a deep-link target scrolls to that message's flat row and centers it", () => {
  const messages = [
    message({ id: "a" }),
    message({ id: "b" }),
    message({ id: "c" }),
  ];
  const rows = buildVirtualTimelineRows(messages);
  const { scrollToIndex, virtualizer } = makeVirtualizer();
  const onTargetReached = mock.fn();

  renderHook(() =>
    useVirtualTimelineScroll({
      channelId: "c1",
      isLoading: false,
      messages,
      rows,
      scrollContainerRef: makeContainerRef(false),
      virtualizer,
      targetMessageId: "b",
      onTargetReached,
    }),
  );

  // layout: [div, a, b, c] -> 'b' is flat index 2
  const centerCall = scrollToIndex.mock.calls.find(
    (call) => call.arguments[1]?.align === "center",
  );
  assert.ok(centerCall, "expected a centered scroll to the deep-link target");
  assert.equal(centerCall?.arguments[0], 2);
  assert.equal(onTargetReached.mock.calls.length, 1);
  assert.equal(onTargetReached.mock.calls[0].arguments[0], "b");
});
