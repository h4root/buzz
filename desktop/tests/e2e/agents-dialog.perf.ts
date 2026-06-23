import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

/**
 * Radix behavioral verification for the AgentsView conditional-mount change.
 *
 * The dialogs were switched from always-mounted `<Dialog open={false}>` to
 * `{isOpen && <Dialog open={isOpen} />}`, so they now mount ALREADY OPEN.
 * Mount-already-open is exactly where Radix can bite, so this proves at
 * runtime (against the built dist) the three behaviors Paul required:
 *   1. enter animation plays (data-state=open present + animate-in class)
 *   2. focus-trap / portal works (focus moves into the portaled dialog)
 *   3. open -> close -> reopen cycle (unmount on close, remount clean)
 *
 * Tracked regression guard under the perf project (serves dist on :4173).
 * Assertions are behavioral (data-state, class presence, focus location,
 * element count) — never timing thresholds — so it can't go red on render
 * drift.
 */

test("AGENTS-DIALOG: conditional-mount Radix behavior (enter anim, focus-trap, reopen)", async ({
  page,
}) => {
  await installMockBridge(page, {
    managedAgents: [
      { pubkey: "a".repeat(64), name: "Agent One", status: "running" },
    ],
  });
  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__ === "function",
  );

  await page.getByTestId("open-agents-view").click();
  await page.getByTestId("agents-library-personas").waitFor();

  const openCreateDialog = async () => {
    await page
      .getByTestId("agents-library-personas")
      .locator('button[aria-haspopup="menu"]', { hasText: "New" })
      .click();
    const item = page.getByRole("menuitem", { name: "Custom Agent" });
    await item.waitFor({ timeout: 5000 });
    // Let the dropdown's open animation settle so the item is stable, not
    // mid-transition (Radix re-parents/animates menu content on open).
    await page.waitForTimeout(300);
    await item.click();
  };

  // --- 1 + 2: open the dialog (mounts already-open), prove enter anim + focus ---
  await openCreateDialog();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // (1) Enter animation: Radix drives the enter off data-state on first DOM
  // commit. animate-in is the CSS enter keyframe class on the content.
  const dataState = await dialog.getAttribute("data-state");
  expect(dataState).toBe("open");
  const className = (await dialog.getAttribute("class")) ?? "";
  expect(className).toContain("animate-in");
  expect(className).toContain("data-[state=open]:fade-in-0");

  // (2) Focus-trap / portal: focus must move INTO the portaled dialog subtree.
  const focusInside = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return !!dlg && dlg.contains(document.activeElement);
  });
  expect(focusInside).toBe(true);

  // --- 3: open -> close -> reopen cycle ---
  // Close via Escape (drives onOpenChange(false) -> state reset -> unmount).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Let the close/exit settle (focus returns to trigger, exit anim detaches)
  // before re-driving the open flow.
  await page.waitForTimeout(400);

  // Reopen: must mount clean again (proves the conditional remounts, the
  // onOpenChange handler reset state, and no stale node lingered).
  await openCreateDialog();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.getByRole("dialog").getAttribute("data-state")).toBe(
    "open",
  );

  // eslint-disable-next-line no-console
  console.log(
    "\n=== AGENTS-DIALOG CHECKS: enter-anim OK, focus-trap OK, reopen OK ===\n",
  );
});
