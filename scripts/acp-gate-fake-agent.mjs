#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";

const logPath = process.env.BUZZ_ACP_GATE_LOG;
if (!logPath) {
  console.error("BUZZ_ACP_GATE_LOG is required");
  process.exit(2);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function log(value) {
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({ at: new Date().toISOString(), ...value })}\n`,
  );
}

function response(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function promptText(params) {
  const prompt = Array.isArray(params?.prompt) ? params.prompt : [];
  return prompt
    .map((block) => {
      if (typeof block?.text === "string") {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

let sessionCounter = 0;
log({ type: "started", pid: process.pid });

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

input.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    log({ type: "invalid_json", line, error: String(error) });
    return;
  }

  const { id, method, params } = message;
  log({ type: "request", method, id: id ?? null });

  if (method === "initialize") {
    writeJson(
      response(id, {
        protocolVersion: 2,
        agentCapabilities: {
          promptCapabilities: {
            image: false,
            audio: false,
            embeddedContext: true,
          },
          sessionCapabilities: { close: {}, list: {}, resume: {} },
          mcpCapabilities: { http: false, sse: false, acp: false },
          auth: { logout: {} },
        },
        agentInfo: {
          name: "acp-gate-fake-agent",
          title: "ACP Gate Fake Agent",
          version: "0.1.0",
        },
      }),
    );
    return;
  }

  if (method === "session/new") {
    sessionCounter += 1;
    writeJson(
      response(id, {
        sessionId: `gate-session-${sessionCounter}`,
        modes: [{ id: "default", name: "Default" }],
        models: [],
        configOptions: [],
      }),
    );
    return;
  }

  if (method === "session/prompt") {
    const text = promptText(params);
    log({
      type: "prompt",
      sessionId: params?.sessionId ?? null,
      promptText: text,
    });
    writeJson(
      response(id, {
        stopReason: "end_turn",
      }),
    );
    return;
  }

  if (
    method === "session/set_config_option" ||
    method === "session/set_model"
  ) {
    writeJson(response(id, {}));
    return;
  }

  if (method === "session/cancel") {
    log({ type: "cancel", sessionId: params?.sessionId ?? null });
    return;
  }

  if (id !== undefined) {
    writeJson(errorResponse(id, -32601, `Method not found: ${method}`));
  }
});

input.on("close", () => {
  log({ type: "stdin_closed" });
});
