import assert from "node:assert/strict";
import test from "node:test";

import { buildBatchImportAgentInput } from "./batchImportPersonaInput.ts";

function preview(overrides = {}) {
  return {
    displayName: "Imported Agent",
    avatarDataUrl: null,
    avatarRef: null,
    systemPrompt: "Use the imported provider.",
    runtime: "goose",
    model: "claude-sonnet-4",
    provider: "anthropic",
    namePool: [],
    sourceFile: "agent.persona.md",
    ...overrides,
  };
}

test("buildBatchImportAgentInput preserves provider from parsed files", () => {
  assert.deepEqual(buildBatchImportAgentInput(preview()), {
    name: "Imported Agent",
    avatarUrl: undefined,
    systemPrompt: "Use the imported provider.",
    runtime: "goose",
    model: "claude-sonnet-4",
    provider: "anthropic",
  });
});

test("buildBatchImportAgentInput uses the embedded avatar data url", () => {
  assert.deepEqual(
    buildBatchImportAgentInput(
      preview({ avatarDataUrl: "data:image/png;base64,abc" }),
    ),
    {
      name: "Imported Agent",
      avatarUrl: "data:image/png;base64,abc",
      systemPrompt: "Use the imported provider.",
      runtime: "goose",
      model: "claude-sonnet-4",
      provider: "anthropic",
    },
  );
});
