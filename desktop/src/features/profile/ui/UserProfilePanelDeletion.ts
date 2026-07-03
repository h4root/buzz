import * as React from "react";

import {
  deleteManagedAgentWithRules,
  type ManagedAgentActionResult,
} from "@/features/agents/lib/managedAgentControlActions";
import { removeChannelMember } from "@/shared/api/tauri";
import type {
  Channel,
  ManagedAgent,
  PresenceLookup,
  RelayAgent,
} from "@/shared/api/types";
import { getRelayAgentChannelIds } from "@/features/profile/ui/UserProfilePanelUtils";

type DeleteManagedAgentRulesContext = Omit<
  Parameters<typeof deleteManagedAgentWithRules>[0],
  "agent"
>;

type DeleteProfileManagedAgentContext = DeleteManagedAgentRulesContext & {
  removeAgentFromAllChannels: (pubkey: string) => Promise<void>;
};

type UseProfileAgentDeletionInput = {
  channels?: readonly Channel[];
  deleteManagedAgent: DeleteManagedAgentRulesContext["deleteManagedAgent"];
  presenceLookup?: PresenceLookup | null;
  relayAgents?: readonly RelayAgent[];
};

export function useProfileAgentDeletion({
  channels,
  deleteManagedAgent,
  presenceLookup,
  relayAgents,
}: UseProfileAgentDeletionInput) {
  const removeAgentFromAllChannels = React.useCallback(
    async (agentPubkey: string) => {
      const normalizedPubkey = agentPubkey.toLowerCase();
      const channelIds = new Set(
        getRelayAgentChannelIds(relayAgents, agentPubkey),
      );
      for (const channel of channels ?? []) {
        if (
          channel.memberPubkeys.some(
            (memberPubkey) => memberPubkey.toLowerCase() === normalizedPubkey,
          )
        ) {
          channelIds.add(channel.id);
        }
      }
      if (channelIds.size === 0) return;
      await Promise.allSettled(
        [...channelIds].map((channelId) =>
          removeChannelMember(channelId, agentPubkey),
        ),
      );
    },
    [channels, relayAgents],
  );

  const deleteManagedAgentRecord = React.useCallback(
    (agentToDelete: ManagedAgent) =>
      deleteProfileManagedAgent(agentToDelete, {
        channels: channels ?? [],
        deleteManagedAgent,
        presenceLookup,
        relayAgents: relayAgents ?? [],
        removeAgentFromAllChannels,
        skipRemoteDeleteConfirm: true,
      }),
    [
      channels,
      deleteManagedAgent,
      presenceLookup,
      relayAgents,
      removeAgentFromAllChannels,
    ],
  );

  return {
    deleteManagedAgentRecord,
    removeAgentFromAllChannels,
  };
}

export async function deleteProfileManagedAgent(
  agent: ManagedAgent,
  context: DeleteProfileManagedAgentContext,
): Promise<ManagedAgentActionResult> {
  const { removeAgentFromAllChannels, ...deleteContext } = context;
  const result = await deleteManagedAgentWithRules({
    agent,
    ...deleteContext,
  });
  if (result.cancelled) return result;

  await removeAgentFromAllChannels(agent.pubkey);
  return result;
}
