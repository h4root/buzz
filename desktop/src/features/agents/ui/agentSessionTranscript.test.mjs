import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscript } from "./agentSessionTranscript.ts";

test("buildTranscript tags assistant chunks with agent_message_chunk", () => {
  const items = buildTranscript([
    {
      seq: 1,
      timestamp: "2026-06-14T20:47:14.000Z",
      kind: "acp_read",
      agentIndex: 0,
      channelId: "channel-1",
      sessionId: "sess-1",
      turnId: "turn-1",
      payload: {
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "msg-1",
            content: [{ type: "text", text: "Marge is summoned." }],
          },
        },
      },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.type, "message");
  assert.equal(items[0]?.acpSource, "agent_message_chunk");
});

test("buildTranscript tags thought chunks with agent_thought_chunk", () => {
  const items = buildTranscript([
    {
      seq: 2,
      timestamp: "2026-06-14T20:47:15.000Z",
      kind: "acp_read",
      agentIndex: 0,
      channelId: "channel-1",
      sessionId: "sess-1",
      turnId: "turn-1",
      payload: {
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "agent_thought_chunk",
            messageId: "thought-1",
            content: [{ type: "text", text: "Considering next step." }],
          },
        },
      },
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.type, "thought");
  assert.equal(items[0]?.acpSource, "agent_thought_chunk");
});
