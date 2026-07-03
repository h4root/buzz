import type { AgentPersona, AgentTeam, ManagedAgent } from "@/shared/api/types";

/**
 * Unified team-member model. A team member is either a managed agent
 * (referenced by pubkey — the primary membership for user teams) or a pack
 * persona (referenced by persona id — pack-installed teams only).
 */
export type TeamMemberKind = "agent" | "persona";

export type TeamCardMember = {
  key: string;
  kind: TeamMemberKind;
  /** Agent pubkey or persona id. */
  id: string;
  displayName: string;
  avatarUrl: string | null;
  model: string | null;
};

export function agentMemberKey(pubkey: string) {
  return `agent:${pubkey}`;
}

export function personaMemberKey(personaId: string) {
  return `persona:${personaId}`;
}

export function memberFromAgent(agent: ManagedAgent): TeamCardMember {
  return {
    key: agentMemberKey(agent.pubkey),
    kind: "agent",
    id: agent.pubkey,
    displayName: agent.name,
    avatarUrl: agent.avatarUrl,
    model: agent.model,
  };
}

export function memberFromPersona(persona: AgentPersona): TeamCardMember {
  return {
    key: personaMemberKey(persona.id),
    kind: "persona",
    id: persona.id,
    displayName: persona.displayName,
    avatarUrl: persona.avatarUrl,
    model: persona.model,
  };
}

/** Split a selected member-key list back into the wire fields. */
export function splitMemberKeys(keys: readonly string[]): {
  personaIds: string[];
  agentPubkeys: string[];
} {
  const personaIds: string[] = [];
  const agentPubkeys: string[] = [];
  for (const key of keys) {
    if (key.startsWith("agent:")) {
      agentPubkeys.push(key.slice("agent:".length));
    } else if (key.startsWith("persona:")) {
      personaIds.push(key.slice("persona:".length));
    }
  }
  return { personaIds, agentPubkeys };
}

export function teamMemberKeys(
  team: Pick<AgentTeam, "personaIds" | "agentPubkeys">,
): string[] {
  return [
    ...team.personaIds.map(personaMemberKey),
    ...team.agentPubkeys.map(agentMemberKey),
  ];
}

export type ResolvedTeamMembers = {
  hasMissingMembers: boolean;
  isComplete: boolean;
  isUsable: boolean;
  memberCount: number;
  missingMemberCount: number;
  resolvedMembers: TeamCardMember[];
  resolvedPersonas: AgentPersona[];
  resolvedAgents: ManagedAgent[];
};

/**
 * Resolve a team's membership against the local persona and agent stores.
 * Missing members (an agent that only exists on another device, or a persona
 * that was removed) are counted but not resolved.
 */
export function resolveTeamMembers(
  team: Pick<AgentTeam, "personaIds" | "agentPubkeys">,
  personas: AgentPersona[],
  agents: ManagedAgent[],
): ResolvedTeamMembers {
  const personasById = new Map(
    personas.map((persona) => [persona.id, persona]),
  );
  const agentsByPubkey = new Map(agents.map((agent) => [agent.pubkey, agent]));

  const resolvedMembers: TeamCardMember[] = [];
  const resolvedPersonas: AgentPersona[] = [];
  const resolvedAgents: ManagedAgent[] = [];
  let missingMemberCount = 0;

  for (const personaId of team.personaIds) {
    const persona = personasById.get(personaId);
    if (persona) {
      resolvedPersonas.push(persona);
      resolvedMembers.push(memberFromPersona(persona));
    } else {
      missingMemberCount += 1;
    }
  }

  for (const pubkey of team.agentPubkeys) {
    const agent = agentsByPubkey.get(pubkey);
    if (agent) {
      resolvedAgents.push(agent);
      resolvedMembers.push(memberFromAgent(agent));
    } else {
      missingMemberCount += 1;
    }
  }

  const memberCount = team.personaIds.length + team.agentPubkeys.length;

  return {
    hasMissingMembers: missingMemberCount > 0,
    isComplete: missingMemberCount === 0,
    isUsable: missingMemberCount === 0 && resolvedMembers.length > 0,
    memberCount,
    missingMemberCount,
    resolvedMembers,
    resolvedPersonas,
    resolvedAgents,
  };
}

export function getUsableTeams(
  teams: readonly AgentTeam[],
  personas: AgentPersona[],
  agents: ManagedAgent[],
) {
  return teams.filter(
    (team) => resolveTeamMembers(team, personas, agents).isUsable,
  );
}
