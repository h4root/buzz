import assert from "node:assert/strict";
import test from "node:test";

import { buildInboxItems, INBOX_PREVIEW_MAX_LENGTH } from "./inbox.ts";

function feedItem(overrides = {}) {
  return {
    id: overrides.id ?? "event-1",
    kind: overrides.kind ?? 45003,
    pubkey: overrides.pubkey ?? "pubkey-1",
    content: overrides.content ?? "hello",
    createdAt: overrides.createdAt ?? 1_700_000_000,
    channelId: overrides.channelId ?? "channel-1",
    channelName: overrides.channelName ?? "general",
    channelType: overrides.channelType,
    tags: overrides.tags ?? [],
    category: overrides.category ?? "activity",
  };
}

function homeFeed({
  mentions = [],
  needsAction = [],
  activity = [],
  agentActivity = [],
} = {}) {
  return {
    feed: {
      mentions,
      needsAction,
      activity,
      agentActivity,
    },
    meta: {
      since: 0,
      total:
        mentions.length +
        needsAction.length +
        activity.length +
        agentActivity.length,
      generatedAt: 1_700_000_000,
    },
  };
}

test("buildInboxItems caps regular and agent previews to the same length", () => {
  const longHumanMessage = `human ${"message ".repeat(50)}`;
  const longAgentMessage = `agent\n\n${"response ".repeat(50)}`;

  const items = buildInboxItems({
    feed: homeFeed({
      activity: [
        feedItem({
          id: "human-message",
          content: longHumanMessage,
          createdAt: 1_700_000_000,
          category: "activity",
        }),
      ],
      agentActivity: [
        feedItem({
          id: "agent-message",
          content: longAgentMessage,
          createdAt: 1_700_000_001,
          category: "agent_activity",
        }),
      ],
    }),
  });

  const human = items.find((item) => item.id === "human-message");
  const agent = items.find((item) => item.id === "agent-message");

  assert.ok(human);
  assert.ok(agent);
  assert.equal(human.preview.length, INBOX_PREVIEW_MAX_LENGTH);
  assert.equal(agent.preview.length, INBOX_PREVIEW_MAX_LENGTH);
  assert.equal(human.preview.endsWith("..."), true);
  assert.equal(agent.preview.endsWith("..."), true);
  assert.equal(agent.preview.includes("\n"), false);
});
