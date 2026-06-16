# Phase 2 Virtualization Feasibility Spike

**Verdict: GO.** `@tanstack/react-virtual` can cleanly own the main timeline. It
absorbs scroll-up pagination with native position retention, owns sticky-bottom
autoscroll, and gives `cmd`+F a real plan. The one non-trivial cost — it must
*replace*, not coexist with, the bespoke scroll manager — is expected and
bounded. Nothing in the three proof points is a blocker.

Spike artifacts (all under `desktop/src/features/messages/`):
- `lib/buildVirtualTimelineRows.ts` — pure flatten helper (+ 9 `.test.mjs` tests, all green)
- `ui/__spike__/VirtualizedTimelinePoc.tsx` — integration-shape PoC (not wired)
- this file

Dependency added: `@tanstack/react-virtual@^3.14.2`.

---

## The core structural mismatch (and the fix)

The live render is **nested**: `TimelineMessageList` builds `<section>` per day,
each wrapping a `<DayDivider>` + its message `<div>`s. A virtualizer can't
measure a nested-section tree — it needs a **flat, index-addressable** list where
every separately-measured thing (each divider AND each message) is its own row.

`buildVirtualTimelineRows` does exactly that flattening, reusing
`buildDayGroupBoundaries` so divider placement stays byte-identical to today's
render — no second source of truth. This is the load-bearing transform and it's
fully unit-tested. Day dividers survive as first-class variable-height rows.

---

## Proof point 1 — Sticky-bottom autoscroll (the riskiest) — OWNABLE, requires replacement

**Finding: the virtualizer must REPLACE `useTimelineScrollManager`, not reconcile
with it.** They both want to own the single scroll container, and that's a
head-on collision — you cannot run both.

Why replacement is clean rather than scary: nearly everything the 427-line
bespoke manager does by hand, the virtualizer does natively.

| Bespoke manager does (by hand)                                  | Virtualizer equivalent                          |
|-----------------------------------------------------------------|-------------------------------------------------|
| `scrollToBottom()` — `scrollIntoView` + `scrollTo` + 2 rAF settle | `scrollToIndex(lastRow, { align: "end" })`    |
| `lockedScrollTopRef` scrollTop locking                          | virtualizer owns scrollTop; no manual lock      |
| ResizeObserver re-pinning on content/timeline resize            | dynamic `measureElement` re-measures + re-anchors |
| `isNearBottom` / `shouldStickToBottomRef` pin tracking          | a `stickToBottom` flag + `scrollToIndex(last)`  |

The PoC shows the autoscroll path in ~3 lines. The real migration deletes the
manual `scrollTop` plumbing; the genuinely-bespoke bits worth porting carefully
are the **`accent` smooth-scroll** (highlighted-message smooth vs auto) and the
**`newMessageCount`** ("N new messages" pill when scrolled up) — both are app
state layered ON the scroll position, easy to keep as a thin wrapper around the
virtualizer. **Risk: medium, as Ned flagged — but it's replacement risk, not
"can it be done" risk.**

## Proof point 2 — Scroll-up pagination with NATIVE position retention — YES. Delete the band-aid.

**This is the headline answer Ned asked for: the virtualizer absorbs it
natively. The double-rAF correction in `useLoadOlderOnScroll.ts` gets DELETED,
not patched.**

Mechanism: the virtualizer keys every row by stable identity (`getItemKey`).
When an older page splices in at the top, every surviving row keeps its key, so
its cached measurement and offset survive — the virtualizer re-anchors the
viewport to the same logical rows automatically. No `previousHeight` snapshot, no
`newHeight - previousHeight` delta, no `requestAnimationFrame(requestAnimationFrame(...))`
post-paint `scrollTop` yank. That brittle after-the-paint correction (tho's
flagged jank #1) is *exactly* what stable-key retention replaces.

`useLoadOlderOnScroll` collapses to "fire `fetchOlder` when near top" — the
`IntersectionObserver` trigger stays, the `restoreScrollPosition` plumbing goes.
The `buildVirtualTimelineRows` prepend test locks in the key-stability contract
this depends on.

## Proof point 3 — `cmd`+F find-in-page — PLAN (with code shape proven)

Virtualization unmounts off-screen rows, so native browser find can't see them.
**Plan: in-app find drives `scrollToIndex` to the target row, mounting it on
demand.** The wiring already exists — `searchActiveMessageId` /
`searchMatchingMessageIds` / `searchQuery` are plumbed through the rows today, and
the current search-scroll effect (`MessageTimeline.tsx` ~L182) already does
`querySelector([data-message-id]) + scrollIntoView`. That `querySelector`
approach breaks under virtualization (row may be unmounted), so it gets replaced
by `findVirtualRowIndexForMessage(...) -> virtualizer.scrollToIndex(rowIndex)`,
which scrolls the row into existence first. The PoC proves this exact path.

Recommended additions for the real PR (not in this spike):
- **Match navigation** (next/prev match) reuses the same `scrollToIndex` bridge.
- **"render-all" escape hatch** for true native `cmd`+F: when find opens, optionally
  bypass virtualization and render all rows. Keep as a fallback toggle, not the
  default — defeats the perf win if always on. My lean: ship the in-app path,
  hold the escape hatch unless QA finds a gap.

---

## Must-keeps — all survive

- **Sticky-bottom autoscroll** — proof point 1. ✅ (via replacement)
- **Day dividers (variable-height interleaved rows)** — first-class flat rows via
  `buildVirtualTimelineRows` + `measureElement`. ✅
- **Jump-to-message deep links (`resolveDeepLinkTarget`)** — same `scrollToIndex`
  bridge as find; `findVirtualRowIndexForMessage` mirrors the "bail if not in
  snapshot yet" contract. ✅
- **No-tearing** — the Phase 1 property (drive scroll logic + render off the SAME
  snapshot) is PRESERVED: `buildVirtualTimelineRows` consumes the same
  `deferredMessages` snapshot the rows render from. ✅

## Recommended sequence for the real PR (post-spike)

1. Land `buildVirtualTimelineRows` + tests (already done here).
2. Build the virtualized list driving off `deferredMessages`; render via the
   existing `MessageRow` / `DayDivider` (reuse, don't rebuild).
3. Replace `useTimelineScrollManager` with a thin virtualizer wrapper preserving
   `accent` smooth-scroll + `newMessageCount`.
4. Gut `useLoadOlderOnScroll` down to the trigger; delete the rAF correction.
5. Rewire search-scroll + deep-link to `scrollToIndex`.
6. Main timeline ONLY — leave the thread pane (Phase 3 may shrink it away).
