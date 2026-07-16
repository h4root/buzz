import assert from "node:assert/strict";
import test from "node:test";

import {
  clearCommunityStorage,
  loadCommunities,
  migrateLegacyCommunityStorage,
} from "./communityStorage.ts";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  };
}

test("migrateLegacyCommunityStorage promotes current Buzz workspace state", () => {
  const storage = createMemoryStorage({
    "buzz-workspaces": '[{"id":"current"}]',
    "buzz-active-workspace-id": "current",
  });

  migrateLegacyCommunityStorage(storage);

  assert.equal(storage.getItem("buzz-communities"), '[{"id":"current"}]');
  assert.equal(storage.getItem("buzz-active-community-id"), "current");
});

test("migrateLegacyCommunityStorage does not overwrite new community state", () => {
  const storage = createMemoryStorage({
    "buzz-communities": '[{"id":"new"}]',
    "buzz-active-community-id": "new",
    "buzz-workspaces": '[{"id":"old"}]',
    "buzz-active-workspace-id": "old",
  });

  migrateLegacyCommunityStorage(storage);

  assert.equal(storage.getItem("buzz-communities"), '[{"id":"new"}]');
  assert.equal(storage.getItem("buzz-active-community-id"), "new");
});

test("clearCommunityStorage removes new and legacy state", () => {
  const storage = createMemoryStorage({
    "buzz-communities": "new",
    "buzz-active-community-id": "new",
    "buzz-workspaces": "old",
    "buzz-active-workspace-id": "old",
  });

  clearCommunityStorage(storage);
  migrateLegacyCommunityStorage(storage);

  assert.equal(storage.length, 0);
});

test("loadCommunities strips legacy nsec and token secrets and persists the cleaned list", () => {
  // `token` was a relay API token sent to an `apply_workspace` arg the Rust
  // command no longer declares — Tauri silently dropped it, so the secret sat
  // unused in localStorage. `nsec` was superseded by the on-disk identity.key.
  const storage = createMemoryStorage({
    "buzz-communities": JSON.stringify([
      {
        id: "ws-1",
        name: "Community A",
        relayUrl: "wss://relay-a.example.com",
        token: "buzz_legacy-secret",
        addedAt: "2024-01-01",
      },
      {
        id: "ws-2",
        name: "Community B",
        relayUrl: "wss://relay-b.example.com",
        nsec: "nsec1legacysecret",
        addedAt: "2024-01-02",
      },
      {
        id: "ws-3",
        name: "Community C",
        relayUrl: "wss://relay-c.example.com",
        addedAt: "2024-01-03",
      },
    ]),
  });
  // loadCommunities reads the real localStorage global (and writes back via
  // window.localStorage), so point both at the in-memory store for the test.
  globalThis.localStorage = storage;
  const hadWindow = "window" in globalThis;
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  try {
    const communities = loadCommunities();

    assert.equal(communities.length, 3);
    for (const community of communities) {
      assert.equal("token" in community, false);
      assert.equal("nsec" in community, false);
    }
    // The cleaned list is persisted back so the secrets cannot leak into
    // future sessions.
    const persisted = storage.getItem("buzz-communities");
    assert.equal(persisted.includes("token"), false);
    assert.equal(persisted.includes("nsec"), false);
    assert.equal(persisted.includes("relay-b.example.com"), true);
  } finally {
    delete globalThis.localStorage;
    if (hadWindow) {
      globalThis.window = previousWindow;
    } else {
      delete globalThis.window;
    }
  }
});
