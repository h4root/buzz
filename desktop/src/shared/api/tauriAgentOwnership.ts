import { resolveOaOwner } from "@/shared/api/tauriIdentityArchive";

export type AgentOwnershipStatus = {
  /** Lowercase hex pubkey of the queried agent. */
  agentPubkey: string;
  /** Lowercase hex owner pubkey from the agent's live `kind:0` NIP-OA `auth` tag, if any. */
  ownerPubkey: string | null;
  /** True iff the current workspace identity is the verified kind:0 owner. */
  isOwner: boolean;
};

/**
 * Resolve whether the current identity owns `agentPubkey`.
 *
 * Authority is the agent's live `kind:0` NIP-OA `auth` tag, verified locally
 * via {@link resolveOaOwner} — the same proof the relay now gates observer-frame
 * delivery on. This is a thin wrapper that adapts {@link OwnerOfAgent} to the
 * stable {@link AgentOwnershipStatus} shape consumed by `useCanViewAgentActivity`
 * and `useChannelAgentSessions`.
 *
 * An agent with no kind:0, no `auth` tag, or a tag that fails verification
 * resolves to `{ ownerPubkey: null, isOwner: false }`.
 */
export async function resolveAgentOwnership(
  agentPubkey: string,
): Promise<AgentOwnershipStatus> {
  const owner = await resolveOaOwner(agentPubkey);
  return {
    agentPubkey: agentPubkey.toLowerCase(),
    ownerPubkey: owner?.owner ?? null,
    isOwner: owner?.isMe ?? false,
  };
}
