#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  console.log(`Usage: scripts/acp-gate-lab.mjs [options]

Runs a local inbound-author-gate lab with three throwaway identities:
owner, bot, and stranger. It creates a private channel, starts buzz-acp with a
fake ACP agent, sends one owner mention and one stranger mention, then reports
which prompts reached the fake agent.

Options:
  --relay <url>              Relay URL (default: ws://localhost:3000)
  --respond-to <mode>        owner-only, allowlist, anyone, or nobody (default: owner-only)
  --allowlist-stranger       Include the stranger in BUZZ_ACP_RESPOND_TO_ALLOWLIST
  --keep                     Keep the temporary work directory
  --no-build                 Skip cargo build for buzz-cli and buzz-acp
  --timeout-ms <ms>          Wait time after sending mentions (default: 8000)
  --verbose                  Stream buzz-acp stderr/stdout while the lab runs
  -h, --help                 Show this help

Expected default result:
  owner_prompt: true
  stranger_prompt: false

If localhost:3000 is already used by another service, start Buzz on an
alternate port and point the lab at it:
  BUZZ_BIND_ADDR=127.0.0.1:3030 BUZZ_HEALTH_PORT=8088 BUZZ_METRICS_PORT=9202 RELAY_URL=ws://localhost:3030 cargo run -p buzz-relay
  scripts/acp-gate-lab.mjs --relay ws://localhost:3030
`);
}

function parseArgs(argv) {
  const options = {
    relay: "ws://localhost:3000",
    respondTo: "owner-only",
    allowlistStranger: false,
    keep: false,
    build: true,
    timeoutMs: 8000,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--relay") {
      options.relay = requiredValue(argv, ++i, arg);
    } else if (arg === "--respond-to") {
      options.respondTo = requiredValue(argv, ++i, arg);
    } else if (arg === "--allowlist-stranger") {
      options.allowlistStranger = true;
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--no-build") {
      options.build = false;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(requiredValue(argv, ++i, arg));
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (
    !["owner-only", "allowlist", "anyone", "nobody"].includes(options.respondTo)
  ) {
    throw new Error(
      "--respond-to must be owner-only, allowlist, anyone, or nobody",
    );
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be a number >= 1000");
  }
  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function run(command, args, { env = {}, input, inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}${
        detail ? `\n${detail}` : ""
      }`,
    );
  }
  return (result.stdout ?? "").trim();
}

function buzzEnv(relay, privateKey) {
  return {
    BUZZ_RELAY_URL: relay,
    BUZZ_PRIVATE_KEY: privateKey,
    BUZZ_AUTH_TAG: "",
  };
}

function relayHttpBase(relay) {
  if (relay.startsWith("ws://")) {
    return `http://${relay.slice("ws://".length)}`;
  }
  if (relay.startsWith("wss://")) {
    return `https://${relay.slice("wss://".length)}`;
  }
  return relay.replace(/\/+$/, "");
}

async function assertBuzzRelay(relay) {
  const base = relayHttpBase(relay);
  let response;
  try {
    response = await fetch(`${base}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
  } catch (error) {
    throw new Error(
      `could not reach relay HTTP bridge at ${base}/query: ${error.message}`,
    );
  }

  if (response.status === 405) {
    throw new Error(
      `${base} is reachable, but POST /query returned 405. That is not the Buzz relay HTTP bridge; start Buzz on an unused port and rerun with --relay ws://localhost:<port>.`,
    );
  }
  if (response.status === 404) {
    throw new Error(
      `${base} is reachable, but /query returned 404. Point --relay at a running Buzz relay.`,
    );
  }
}

function runBuzz(buzzBin, relay, privateKey, args, options = {}) {
  return run(buzzBin, args, {
    env: buzzEnv(relay, privateKey),
    input: options.input,
  });
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`failed to parse ${label} JSON: ${error}\n${output}`);
  }
}

async function loadNostrTools() {
  const modulePath = path.join(
    repoRoot,
    "desktop/node_modules/nostr-tools/lib/esm/index.js",
  );
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error(
      "nostr-tools is not installed. Run `pnpm install` from the repo root first.",
    );
  }
  return import(pathToFileURL(modulePath));
}

function createIdentity(nostr, label, suffix) {
  const secret = nostr.generateSecretKey();
  return {
    label,
    name: `Gate${label}${suffix}`,
    nsec: nostr.nip19.nsecEncode(secret),
    pubkey: nostr.getPublicKey(secret),
  };
}

async function readPromptLog(logPath) {
  let raw;
  try {
    raw = await fs.readFile(logPath, "utf8");
  } catch {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.type === "prompt");
}

async function waitForPromptCount(logPath, count, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let prompts = [];
  while (Date.now() < deadline) {
    prompts = await readPromptLog(logPath);
    if (prompts.length >= count) {
      return prompts;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return prompts;
}

async function waitForFileContains(filePath, needle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      if (content.includes(needle)) {
        return true;
      }
    } catch {
      // File may not exist yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const cleanExit = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
  ]);
  if (!cleanExit && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
}

function extractChannelId(createOutput) {
  const parsed = parseJson(createOutput, "channel create");
  const id = parsed.channel_id ?? parsed.id ?? parsed.channelId;
  if (!id) {
    throw new Error(
      `channel create response did not include a channel id: ${createOutput}`,
    );
  }
  return id;
}

function sendMention({ buzzBin, relay, sender, channelId, botName, marker }) {
  const output = runBuzz(buzzBin, relay, sender.nsec, [
    "messages",
    "send",
    "--channel",
    channelId,
    "--content",
    `@${botName} ${marker}`,
  ]);
  const parsed = parseJson(output, `${sender.label} mention`);
  return parsed.event_id ?? parsed.id ?? null;
}

function summarizePrompts(prompts, ownerMarker, strangerMarker) {
  return {
    ownerPrompt: prompts.some((entry) =>
      entry.promptText.includes(ownerMarker),
    ),
    strangerPrompt: prompts.some((entry) =>
      entry.promptText.includes(strangerMarker),
    ),
    promptCount: prompts.length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const nostr = await loadNostrTools();
  const suffix = `-${Date.now().toString(36).slice(-6)}`;
  const owner = createIdentity(nostr, "Owner", suffix);
  const bot = createIdentity(nostr, "Bot", suffix);
  const stranger = createIdentity(nostr, "Stranger", suffix);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "buzz-acp-gate-"));
  const promptLog = path.join(tempDir, "fake-agent-prompts.ndjson");
  const acpLog = path.join(tempDir, "buzz-acp.log");
  const buzzBin = path.join(repoRoot, "target/debug/buzz");
  const buzzAcpBin = path.join(repoRoot, "target/debug/buzz-acp");
  const fakeAgent = path.join(repoRoot, "scripts/acp-gate-fake-agent.mjs");

  console.log(`relay: ${options.relay}`);
  console.log(`workdir: ${tempDir}`);

  try {
    await assertBuzzRelay(options.relay);

    if (options.build) {
      console.log("building buzz-cli and buzz-acp...");
      run("cargo", ["build", "-q", "-p", "buzz-cli", "-p", "buzz-acp"], {
        inherit: options.verbose,
      });
    }

    console.log("creating throwaway profiles...");
    runBuzz(buzzBin, options.relay, owner.nsec, [
      "users",
      "set-profile",
      "--name",
      owner.name,
    ]);
    runBuzz(buzzBin, options.relay, bot.nsec, [
      "users",
      "set-profile",
      "--name",
      bot.name,
    ]);
    runBuzz(buzzBin, options.relay, stranger.nsec, [
      "users",
      "set-profile",
      "--name",
      stranger.name,
    ]);

    console.log("creating private channel and adding bot + stranger...");
    const channelId = extractChannelId(
      runBuzz(buzzBin, options.relay, owner.nsec, [
        "channels",
        "create",
        "--name",
        `gate-lab${suffix}`,
        "--type",
        "stream",
        "--visibility",
        "private",
      ]),
    );
    runBuzz(buzzBin, options.relay, owner.nsec, [
      "channels",
      "add-member",
      "--channel",
      channelId,
      "--pubkey",
      bot.pubkey,
      "--role",
      "bot",
    ]);
    runBuzz(buzzBin, options.relay, owner.nsec, [
      "channels",
      "add-member",
      "--channel",
      channelId,
      "--pubkey",
      stranger.pubkey,
      "--role",
      "member",
    ]);

    const allowlist =
      options.respondTo === "allowlist"
        ? options.allowlistStranger
          ? stranger.pubkey
          : owner.pubkey
        : "";
    console.log(`starting buzz-acp (${options.respondTo})...`);
    const acp = spawn(buzzAcpBin, [], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BUZZ_RELAY_URL: options.relay,
        BUZZ_PRIVATE_KEY: bot.nsec,
        BUZZ_AUTH_TAG: "",
        BUZZ_ACP_AGENT_OWNER: owner.pubkey,
        BUZZ_ACP_RESPOND_TO: options.respondTo,
        BUZZ_ACP_RESPOND_TO_ALLOWLIST: allowlist,
        BUZZ_ACP_AGENT_COMMAND: fakeAgent,
        BUZZ_ACP_AGENT_ARGS: "",
        BUZZ_ACP_MCP_COMMAND: "",
        BUZZ_ACP_AGENTS: "1",
        BUZZ_ACP_NO_MEMORY: "true",
        BUZZ_ACP_NO_PRESENCE: "true",
        BUZZ_ACP_NO_TYPING: "true",
        BUZZ_ACP_DEDUP: "queue",
        BUZZ_ACP_MULTIPLE_EVENT_HANDLING: "queue",
        BUZZ_ACP_CONTEXT_MESSAGE_LIMIT: "0",
        BUZZ_ACP_GATE_LOG: promptLog,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const acpLogHandle = await fs.open(acpLog, "a");
    acp.stdout.on("data", (chunk) => {
      acpLogHandle.write(chunk);
      if (options.verbose) process.stdout.write(chunk);
    });
    acp.stderr.on("data", (chunk) => {
      acpLogHandle.write(chunk);
      if (options.verbose) process.stderr.write(chunk);
    });

    try {
      const ready = await waitForFileContains(
        acpLog,
        "subscribed to channel",
        10000,
      );
      if (!ready) {
        throw new Error(
          `buzz-acp did not subscribe to the test channel within 10s; see ${acpLog}`,
        );
      }

      const ownerMarker = `owner-marker-${Date.now()}`;
      const strangerMarker = `stranger-marker-${Date.now()}`;
      const ownerEventId = sendMention({
        buzzBin,
        relay: options.relay,
        sender: owner,
        channelId,
        botName: bot.name,
        marker: ownerMarker,
      });
      await waitForPromptCount(promptLog, 1, options.timeoutMs);

      const strangerEventId = sendMention({
        buzzBin,
        relay: options.relay,
        sender: stranger,
        channelId,
        botName: bot.name,
        marker: strangerMarker,
      });
      const prompts = await waitForPromptCount(promptLog, 2, options.timeoutMs);
      const summary = summarizePrompts(prompts, ownerMarker, strangerMarker);

      console.log(
        JSON.stringify(
          {
            respond_to: options.respondTo,
            allowlist_stranger: options.allowlistStranger,
            channel_id: channelId,
            owner_pubkey: owner.pubkey,
            bot_pubkey: bot.pubkey,
            stranger_pubkey: stranger.pubkey,
            owner_event_id: ownerEventId,
            stranger_event_id: strangerEventId,
            owner_prompt: summary.ownerPrompt,
            stranger_prompt: summary.strangerPrompt,
            prompt_count: summary.promptCount,
            prompt_log: promptLog,
            buzz_acp_log: acpLog,
          },
          null,
          2,
        ),
      );

      if (options.respondTo === "owner-only" && summary.strangerPrompt) {
        throw new Error(
          "owner-only gate failed: stranger prompt reached the fake agent",
        );
      }
      if (options.respondTo === "owner-only" && !summary.ownerPrompt) {
        throw new Error(
          "owner-only gate failed: owner prompt did not reach the fake agent",
        );
      }
    } finally {
      await stopProcess(acp);
      await acpLogHandle.close();
    }
  } finally {
    if (options.keep) {
      console.log(`kept workdir: ${tempDir}`);
    } else {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(1);
});
