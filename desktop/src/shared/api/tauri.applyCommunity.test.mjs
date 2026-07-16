import assert from "node:assert/strict";
import test from "node:test";

import { applyCommunity } from "./tauri.ts";

/**
 * Regression test for the applyCommunity → apply_workspace arg contract.
 *
 * Tauri silently drops any invoke arg the Rust command does not declare: the
 * frontend once sent a `token` arg that `apply_workspace` had stopped
 * accepting, so the persisted Community.token was never applied — with no
 * error anywhere. Guard the exact key set against the Rust signature
 * (`apply_workspace(relay_url, nsec, repos_dir)` in
 * desktop/src-tauri/src/commands/workspace.rs) so a drifting arg fails here
 * instead of vanishing at the IPC boundary.
 */
test("applyCommunity sends exactly the args apply_workspace declares", async () => {
  const calls = [];
  const hadWindow = "window" in globalThis;
  const previousWindow = globalThis.window;
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        calls.push({ cmd, args });
      },
    },
  };
  try {
    await applyCommunity("wss://relay.example.com", undefined, "/repos");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, "apply_workspace");
    assert.deepEqual(Object.keys(calls[0].args).sort(), [
      "nsec",
      "relayUrl",
      "reposDir",
    ]);
    assert.equal(calls[0].args.relayUrl, "wss://relay.example.com");
    assert.equal(calls[0].args.nsec, null);
    assert.equal(calls[0].args.reposDir, "/repos");
  } finally {
    if (hadWindow) {
      globalThis.window = previousWindow;
    } else {
      delete globalThis.window;
    }
  }
});
