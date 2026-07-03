import type { AgentDraft } from "@/features/agents/ui/agentDraft";

const OPEN_CREATE_AGENT_EVENT = "buzz:open-create-agent";

type PendingOpenCreateAgent = {
  draft: AgentDraft | null;
};

let pendingOpenCreateAgent: PendingOpenCreateAgent | null = null;

/**
 * Ask the Agents view to open the create-agent flow. Without a draft it opens
 * the wizard's start step; with a draft (e.g. "duplicate this agent" from a
 * profile panel) it jumps straight to the prefilled details step. The request
 * is retained until the Agents view mounts and consumes it.
 */
export function requestOpenCreateAgent(draft?: AgentDraft) {
  pendingOpenCreateAgent = { draft: draft ?? null };
  window.dispatchEvent(new Event(OPEN_CREATE_AGENT_EVENT));
}

export function consumePendingOpenCreateAgent(): PendingOpenCreateAgent | null {
  const pending = pendingOpenCreateAgent;
  pendingOpenCreateAgent = null;
  return pending;
}

export function subscribeOpenCreateAgent(
  handler: (pending: PendingOpenCreateAgent) => void,
) {
  function handleOpenCreateAgent() {
    const pending = pendingOpenCreateAgent ?? { draft: null };
    pendingOpenCreateAgent = null;
    handler(pending);
  }

  window.addEventListener(OPEN_CREATE_AGENT_EVENT, handleOpenCreateAgent);

  return () => {
    window.removeEventListener(OPEN_CREATE_AGENT_EVENT, handleOpenCreateAgent);
  };
}
