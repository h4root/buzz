import * as React from "react";

import { useChannelMembersQuery } from "@/features/channels/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";

/**
 * Returns a `Set<string>` of normalized pubkeys that are already members of
 * the given channel. The query is only enabled when `enabled` is true (e.g.
 * when the dialog is open).
 */
export function useInChannelAgentPubkeys(
  channelId: string | null,
  enabled: boolean,
): ReadonlySet<string> {
  const membersQuery = useChannelMembersQuery(channelId, enabled);

  return React.useMemo(() => {
    const members = membersQuery.data;
    if (!members) {
      return new Set<string>();
    }

    return new Set(members.map((member) => normalizePubkey(member.pubkey)));
  }, [membersQuery.data]);
}
