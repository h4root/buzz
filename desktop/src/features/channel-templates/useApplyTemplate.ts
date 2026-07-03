import { useQueryClient } from "@tanstack/react-query";

import {
  attachManagedAgentToChannel,
  createChannelManagedAgents,
  type CreateChannelManagedAgentInput,
} from "@/features/agents/channelAgents";
import {
  useAgentTemplatesQuery,
  useAvailableAcpRuntimes,
  useManagedAgentsQuery,
  usePersonasQuery,
  useTeamsQuery,
} from "@/features/agents/hooks";
import { resolvePersonaRuntime } from "@/features/agents/lib/resolvePersonaRuntime";
import { resolveTeamMembers } from "@/features/agents/lib/teamMembers";
import { useLastRuntime } from "@/features/agents/lib/useLastRuntime";
import { useChannelTemplatesQuery } from "@/features/channel-templates/hooks";
import { setCanvas } from "@/shared/api/tauri";
import type { ChannelTemplate, ManagedAgent } from "@/shared/api/types";

/**
 * TemplateBackend omits `config` — supply an empty object for provider backends.
 */
function toManagedBackend(
  backend: ChannelTemplate["agents"]["personas"][number]["backend"],
): CreateChannelManagedAgentInput["backend"] {
  if (!backend || backend.type === "local") return { type: "local" };
  return { type: "provider", id: backend.id, config: {} };
}

export function useApplyTemplate() {
  const queryClient = useQueryClient();
  const channelTemplatesQuery = useChannelTemplatesQuery();
  const acpRuntimesQuery = useAvailableAcpRuntimes();
  const personasQuery = usePersonasQuery();
  const teamsQuery = useTeamsQuery();
  const managedAgentsQuery = useManagedAgentsQuery();
  const agentTemplatesQuery = useAgentTemplatesQuery();
  const { lastRuntimeId } = useLastRuntime();

  async function applyCanvas(
    templateId: string | undefined,
    channelId: string,
    channelName: string,
  ) {
    if (!templateId) return;
    const template = channelTemplatesQuery.data?.find(
      (t) => t.id === templateId,
    );
    if (!template?.canvasTemplate) return;
    const content = template.canvasTemplate
      .replace(/\{channel\.name\}/g, channelName)
      .replace(/\{template\.name\}/g, template.name);
    try {
      await setCanvas({ channelId, content });
    } catch {
      // Canvas is best-effort — don't block navigation
    }
  }

  async function applyAgents(
    templateId: string | undefined,
    channelId: string,
  ) {
    if (!templateId) return;
    const template = channelTemplatesQuery.data?.find(
      (t) => t.id === templateId,
    );
    if (!template) return;
    const { personas: templateEntries, teams: templateTeams } = template.agents;
    if (templateEntries.length === 0 && templateTeams.length === 0) return;

    const allPersonas = personasQuery.data ?? [];
    const allTeams = teamsQuery.data ?? [];
    const allAgents = managedAgentsQuery.data ?? [];
    const agentTemplates = agentTemplatesQuery.data ?? [];
    const runtimes = acpRuntimesQuery.data ?? [];
    if (runtimes.length === 0) return; // No runtimes — skip silently

    // Resolve default provider: user's last-used preference, or first available
    const defaultProvider =
      runtimes.find((p) => p.id === lastRuntimeId) ?? runtimes[0] ?? null;
    if (!defaultProvider) return;

    const seenRefs = new Set<string>();
    const attachAgents: ManagedAgent[] = [];
    const inputs: CreateChannelManagedAgentInput[] = [];

    // A template member ref (the legacy `personaId` field) can be an agent
    // pubkey, a pack persona id, or a built-in agent-template id.
    const resolveEntry = (
      ref: string,
      runtimeHint: string | null,
      model: string | null,
      backend: ChannelTemplate["agents"]["personas"][number]["backend"],
    ) => {
      if (seenRefs.has(ref)) return;
      seenRefs.add(ref);

      const agent = allAgents.find((candidate) => candidate.pubkey === ref);
      if (agent) {
        attachAgents.push(agent);
        return;
      }

      const persona = allPersonas.find((candidate) => candidate.id === ref);
      if (persona) {
        const resolved = resolvePersonaRuntime(
          runtimeHint ?? persona.runtime,
          runtimes,
          defaultProvider,
        );
        inputs.push({
          runtime: resolved.runtime ?? defaultProvider,
          name: persona.displayName,
          personaId: persona.id,
          systemPrompt: persona.systemPrompt,
          avatarUrl: persona.avatarUrl ?? undefined,
          model: model ?? persona.model ?? undefined,
          role: "bot",
          backend: toManagedBackend(backend),
        });
        return;
      }

      const agentTemplate = agentTemplates.find(
        (candidate) => candidate.id === ref,
      );
      if (agentTemplate) {
        const resolved = resolvePersonaRuntime(
          runtimeHint ?? agentTemplate.runtime,
          runtimes,
          defaultProvider,
        );
        inputs.push({
          runtime: resolved.runtime ?? defaultProvider,
          name: agentTemplate.displayName,
          systemPrompt: agentTemplate.systemPrompt,
          avatarUrl: agentTemplate.avatarUrl ?? undefined,
          model: model ?? agentTemplate.model ?? undefined,
          role: "bot",
          backend: toManagedBackend(backend),
        });
      }
    };

    for (const entry of templateEntries) {
      resolveEntry(entry.personaId, entry.runtime, entry.model, entry.backend);
    }

    // Team-expanded members (skip dupes)
    for (const teamEntry of templateTeams) {
      const team = allTeams.find((t) => t.id === teamEntry.teamId);
      if (!team) continue;
      const resolution = resolveTeamMembers(team, allPersonas, allAgents);
      for (const agent of resolution.resolvedAgents) {
        resolveEntry(
          agent.pubkey,
          teamEntry.runtime,
          teamEntry.model,
          teamEntry.backend,
        );
      }
      for (const persona of resolution.resolvedPersonas) {
        resolveEntry(
          persona.id,
          teamEntry.runtime,
          teamEntry.model,
          teamEntry.backend,
        );
      }
    }

    if (inputs.length === 0 && attachAgents.length === 0) return;

    try {
      const result =
        inputs.length > 0
          ? await createChannelManagedAgents(channelId, inputs)
          : { successes: [], failures: [] };

      for (const agent of attachAgents) {
        try {
          await attachManagedAgentToChannel(channelId, {
            agent,
            role: "bot",
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

      if (result.failures.length > 0) {
        const { toast } = await import("sonner");
        toast.warning(
          result.failures.length === 1
            ? "1 agent from the template could not be created"
            : `${result.failures.length} agents from the template could not be created`,
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["channels", channelId, "members"],
        }),
        queryClient.invalidateQueries({ queryKey: ["managed-agents"] }),
        queryClient.invalidateQueries({ queryKey: ["relay-agents"] }),
      ]);
    } catch {
      // Agent creation is best-effort — don't block navigation
    }
  }

  return { applyCanvas, applyAgents };
}
