import { AlertTriangle } from "lucide-react";
import * as React from "react";

import { useAvailableAcpRuntimes } from "@/features/agents/hooks";
import {
  attachManagedAgentToChannel,
  createChannelManagedAgents,
  type CreateChannelManagedAgentInput,
  type CreateChannelManagedAgentsResult,
} from "@/features/agents/channelAgents";
import { resolveTeamMembers } from "@/features/agents/lib/teamMembers";
import {
  collectRuntimeWarnings,
  resolvePersonaRuntime,
} from "@/features/agents/lib/resolvePersonaRuntime";
import { useChannelsQuery } from "@/features/channels/hooks";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AgentPersona,
  AgentTeam,
  Channel,
  ChannelRole,
  ManagedAgent,
} from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type AddTeamToChannelDialogProps = {
  team: AgentTeam | null;
  personas: AgentPersona[];
  agents: ManagedAgent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeployed: (
    channel: Channel,
    result: CreateChannelManagedAgentsResult,
  ) => void;
};

export function AddTeamToChannelDialog({
  team,
  personas,
  agents,
  open,
  onOpenChange,
  onDeployed,
}: AddTeamToChannelDialogProps) {
  const channelsQuery = useChannelsQuery();
  const providersQuery = useAvailableAcpRuntimes();
  const queryClient = useQueryClient();
  const [channelId, setChannelId] = React.useState("");
  const [role, setRole] = React.useState<Exclude<ChannelRole, "owner">>("bot");
  const deployMutation = useMutation({
    mutationFn: async (input: {
      channelId: string;
      personaInputs: CreateChannelManagedAgentInput[];
      memberAgents: ManagedAgent[];
    }): Promise<CreateChannelManagedAgentsResult> => {
      // Existing agent members attach directly; pack persona members go
      // through the persona create/reuse path.
      const result =
        input.personaInputs.length > 0
          ? await createChannelManagedAgents(
              input.channelId,
              input.personaInputs,
            )
          : { successes: [], failures: [] };

      for (const agent of input.memberAgents) {
        try {
          const attached = await attachManagedAgentToChannel(input.channelId, {
            agent,
            role,
          });
          result.successes.push({
            ...attached,
            created: false,
            runtimeId: "",
          });
        } catch (error) {
          result.failures.push({
            kind: "generic",
            name: agent.name,
            personaId: null,
            error:
              error instanceof Error ? error.message : "Failed to add agent.",
          });
        }
      }

      return result;
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["managed-agents"] });
      void queryClient.invalidateQueries({ queryKey: ["relay-agents"] });
      void queryClient.invalidateQueries({
        queryKey: ["channels", variables?.channelId, "members"],
      });
    },
  });

  const channels = React.useMemo(
    () =>
      (channelsQuery.data ?? []).filter(
        (channel) => channel.channelType !== "dm" && !channel.archivedAt,
      ),
    [channelsQuery.data],
  );

  const providers = providersQuery.data ?? [];
  const defaultProvider = providers[0] ?? null;

  const resolution = React.useMemo(
    () =>
      team
        ? resolveTeamMembers(team, personas, agents)
        : resolveTeamMembers(
            { personaIds: [], agentPubkeys: [] },
            personas,
            agents,
          ),
    [team, personas, agents],
  );
  const resolvedPersonas = resolution.resolvedPersonas;
  const resolvedAgents = resolution.resolvedAgents;
  const resolvedMembers = resolution.resolvedMembers;
  const missingMemberCount = resolution.missingMemberCount;

  // Surface warnings when a pack persona's preferred runtime is unavailable.
  // This dialog has no runtime selector, so the fallback is always
  // `defaultProvider` (the first available runtime).
  const runtimeWarnings = React.useMemo(
    () => collectRuntimeWarnings(resolvedPersonas, providers, defaultProvider),
    [resolvedPersonas, providers, defaultProvider],
  );

  function reset() {
    setChannelId("");
    setRole("bot");
    deployMutation.reset();
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (!channelId && channels.length > 0) {
      setChannelId(channels[0].id);
    }
  }, [channelId, channels, open]);

  const selectedChannel =
    channels.find((channel) => channel.id === channelId) ?? null;

  async function handleDeploy() {
    if (!team || !selectedChannel) {
      return;
    }
    if (resolvedPersonas.length > 0 && !defaultProvider) {
      return;
    }

    try {
      // Pack persona members: resolve each persona's preferred runtime.
      // This dialog has no runtime selector, so the fallback is
      // `defaultProvider` (first available runtime). Warnings are computed
      // separately via the `runtimeWarnings` memo above.
      const personaInputs = resolvedPersonas.map((persona) => {
        const { runtime: personaRuntime } = resolvePersonaRuntime(
          persona.runtime,
          providers,
          defaultProvider,
        );
        const runtimeToUse = personaRuntime ?? defaultProvider;
        if (!runtimeToUse) {
          throw new Error("No available runtime found for this team.");
        }
        return {
          runtime: {
            id: runtimeToUse.id,
            label: runtimeToUse.label,
            command: runtimeToUse.command,
            defaultArgs: runtimeToUse.defaultArgs,
            mcpCommand: runtimeToUse.mcpCommand,
          },
          name: persona.displayName,
          systemPrompt: persona.systemPrompt,
          avatarUrl: persona.avatarUrl ?? undefined,
          model: persona.model ?? undefined,
          personaId: persona.id,
          role,
        };
      });

      const result = await deployMutation.mutateAsync({
        channelId: selectedChannel.id,
        personaInputs,
        memberAgents: resolvedAgents,
      });
      onDeployed(selectedChannel, result);
      handleOpenChange(false);
    } catch {
      // React Query stores the error; keep the dialog open.
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <div className="flex max-h-[85vh] flex-col">
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5 pr-14">
            <DialogTitle>Deploy team to channel</DialogTitle>
            <DialogDescription>
              Add every agent in <strong>{team?.name ?? "this team"}</strong> to
              the selected channel.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {resolvedMembers.length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-sm font-medium">
                  Agents ({resolvedMembers.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {resolvedMembers.map((member) => (
                    <div
                      className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2 py-1"
                      key={member.key}
                    >
                      <ProfileAvatar
                        avatarUrl={member.avatarUrl}
                        className="h-5 w-5 text-2xs"
                        label={member.displayName}
                      />
                      <span className="text-xs font-medium">
                        {member.displayName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="team-channel-id">
                Channel
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
                disabled={channels.length === 0 || deployMutation.isPending}
                id="team-channel-id"
                onChange={(event) => setChannelId(event.target.value)}
                value={channelId}
              >
                {channels.length === 0 ? (
                  <option value="">No channels available</option>
                ) : null}
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name} · {channel.visibility}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-sm font-medium"
                htmlFor="team-channel-role"
              >
                Role
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
                disabled={deployMutation.isPending}
                id="team-channel-role"
                onChange={(event) =>
                  setRole(event.target.value as Exclude<ChannelRole, "owner">)
                }
                value={role}
              >
                <option value="bot">bot</option>
                <option value="member">member</option>
                <option value="guest">guest</option>
                <option value="admin">admin</option>
              </select>
            </div>

            {missingMemberCount > 0 ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                This team references {missingMemberCount} agent
                {missingMemberCount === 1 ? "" : "s"} that{" "}
                {missingMemberCount === 1 ? "is" : "are"} no longer available on
                this device. Edit the team before deploying.
              </p>
            ) : null}

            {resolvedPersonas.length > 0 &&
            !defaultProvider &&
            !providersQuery.isLoading ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                No ACP runtimes found. Make sure an agent runtime (e.g. Goose)
                is installed.
              </p>
            ) : null}

            {runtimeWarnings.length > 0
              ? runtimeWarnings.map((warning) => (
                  <div
                    className="flex gap-3 rounded-2xl border border-warning/30 bg-warning-bg px-4 py-3"
                    key={warning}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-sm text-warning">{warning}</p>
                  </div>
                ))
              : null}

            {channelsQuery.error instanceof Error ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {channelsQuery.error.message}
              </p>
            ) : null}

            {deployMutation.error instanceof Error ? (
              <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {deployMutation.error.message}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-6 py-4">
            <Button
              onClick={() => handleOpenChange(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !team ||
                !selectedChannel ||
                (resolvedPersonas.length > 0 && !defaultProvider) ||
                resolvedMembers.length === 0 ||
                missingMemberCount > 0 ||
                channelsQuery.isLoading ||
                providersQuery.isLoading ||
                deployMutation.isPending
              }
              onClick={() => void handleDeploy()}
              size="sm"
              type="button"
            >
              {deployMutation.isPending
                ? "Deploying..."
                : `Deploy ${resolvedMembers.length} ${resolvedMembers.length === 1 ? "agent" : "agents"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
