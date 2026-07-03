import { Check, Users } from "lucide-react";
import type * as React from "react";

import type { AgentPersona, AgentTeam, ManagedAgent } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { resolveTeamMembers } from "@/features/agents/lib/teamMembers";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

type SelectionChipButtonProps = {
  disabled: boolean;
  label: string;
  onClick: () => void;
  selected: boolean;
  children: React.ReactNode;
};

function SelectionChipButton({
  disabled,
  label: _label,
  onClick,
  selected,
  children,
}: SelectionChipButtonProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/80 bg-background/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * Resolve a team's members to concrete agent pubkeys: direct agent members
 * plus the agents backing any pack persona members.
 */
export function resolveTeamAgentPubkeys(
  team: AgentTeam,
  personas: AgentPersona[],
  agents: ManagedAgent[],
): string[] {
  const resolution = resolveTeamMembers(team, personas, agents);
  const pubkeys = resolution.resolvedAgents.map((agent) => agent.pubkey);
  for (const persona of resolution.resolvedPersonas) {
    const backing = agents.find((agent) => agent.personaId === persona.id);
    if (backing && !pubkeys.includes(backing.pubkey)) {
      pubkeys.push(backing.pubkey);
    }
  }
  return pubkeys;
}

type AddChannelBotTeamsSectionProps = {
  agents: ManagedAgent[];
  canToggleSelections: boolean;
  inChannelPubkeys?: ReadonlySet<string>;
  isLoading: boolean;
  onToggleTeam: (agentPubkeys: string[]) => void;
  personas: AgentPersona[];
  selectedAgentPubkeys: readonly string[];
  teams: AgentTeam[];
};

export function AddChannelBotTeamsSection({
  agents,
  canToggleSelections,
  inChannelPubkeys,
  isLoading,
  onToggleTeam,
  personas,
  selectedAgentPubkeys,
  teams,
}: AddChannelBotTeamsSectionProps) {
  if (isLoading || teams.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">Teams</div>
        <p className="text-xs text-muted-foreground">
          Select a team to toggle all its agents at once.
        </p>
      </div>

      <TooltipProvider delayDuration={150}>
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => {
            const memberPubkeys = resolveTeamAgentPubkeys(
              team,
              personas,
              agents,
            );
            const memberAgents = memberPubkeys
              .map((pubkey) => agents.find((agent) => agent.pubkey === pubkey))
              .filter((agent): agent is ManagedAgent => agent != null);
            const allSelected =
              memberPubkeys.length > 0 &&
              memberPubkeys.every((pubkey) =>
                selectedAgentPubkeys.includes(pubkey),
              );
            const inChannelCount = inChannelPubkeys
              ? memberPubkeys.filter((pubkey) =>
                  inChannelPubkeys.has(normalizePubkey(pubkey)),
                ).length
              : 0;
            const allInChannel =
              inChannelCount > 0 && inChannelCount === memberPubkeys.length;

            return (
              <Tooltip key={team.id}>
                <TooltipTrigger asChild>
                  <div>
                    <SelectionChipButton
                      disabled={
                        !canToggleSelections ||
                        memberPubkeys.length === 0 ||
                        allInChannel
                      }
                      label={team.name}
                      onClick={() => onToggleTeam(memberPubkeys)}
                      selected={allSelected}
                    >
                      <Users
                        className={cn(
                          "h-4 w-4",
                          allSelected ? "text-primary" : "text-current",
                        )}
                      />
                      {team.name}
                      <span
                        className={cn(
                          "text-xs",
                          allSelected ? "text-primary/70" : "text-current/70",
                        )}
                      >
                        ({memberPubkeys.length})
                      </span>
                      {inChannelCount > 0 ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none",
                            allSelected
                              ? "bg-primary/15 text-primary"
                              : "bg-muted/60 text-muted-foreground",
                          )}
                        >
                          <Check className="h-4 w-4" />
                          {allInChannel
                            ? "All in channel"
                            : `${inChannelCount} in channel`}
                        </span>
                      ) : null}
                    </SelectionChipButton>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-left">
                  <div className="space-y-1.5">
                    <p className="font-medium">{team.name}</p>
                    {team.description ? (
                      <p className="text-2xs text-primary-foreground/80">
                        {team.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {memberAgents.map((agent) => {
                        const agentInChannel =
                          inChannelPubkeys?.has(
                            normalizePubkey(agent.pubkey),
                          ) ?? false;
                        return (
                          <div
                            className="flex items-center gap-1 rounded-full bg-primary-foreground/10 px-1.5 py-0.5"
                            key={agent.pubkey}
                          >
                            <ProfileAvatar
                              avatarUrl={agent.avatarUrl}
                              className="h-4 w-4 text-3xs bg-primary-foreground/20 text-primary-foreground"
                              label={agent.name}
                            />
                            <span className="text-2xs text-primary-foreground">
                              {agent.name}
                            </span>
                            {agentInChannel ? (
                              <Check className="h-4 w-4 text-emerald-300" />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
