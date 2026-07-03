import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  managedAgentsQueryKey,
  personasQueryKey,
  teamsQueryKey,
  useAvailableAcpRuntimes,
  useCreateTeamMutation,
  useDeleteTeamMutation,
  useManagedAgentsQuery,
  usePersonasQuery,
  useTeamsQuery,
  useUpdateTeamMutation,
} from "@/features/agents/hooks";
import type { CreateChannelManagedAgentsResult } from "@/features/agents/channelAgents";
import {
  type ParsedTeamPreview,
  createTeam as createTeamApi,
  exportTeamToJson,
  installTeamFromDirectory,
  parseTeamFile,
  pickTeamDirectory,
  syncTeamDirectory,
} from "@/shared/api/tauriTeams";
import { deletePersona, updatePersona } from "@/shared/api/tauriPersonas";
import {
  createManagedAgent,
  deleteManagedAgent,
  updateManagedAgent,
} from "@/shared/api/tauri";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AcpRuntime,
  AgentTeam,
  Channel,
  CreateTeamInput,
  UpdateTeamInput,
} from "@/shared/api/types";
import type { RemovedTeamMemberRef } from "./TeamDialog";
import { buildTeamImportPlan } from "./teamImportPlan";

type TeamDialogState = {
  description: string;
  initialValues: CreateTeamInput | UpdateTeamInput;
  submitLabel: string;
  title: string;
} | null;

type ActionMessages = {
  setActionNoticeMessage: (message: string | null) => void;
  setActionErrorMessage: (message: string | null) => void;
};

type RefetchCallbacks = {
  refetchManagedAgents: () => void;
  refetchRelayAgents: () => void;
};

type TeamImportUpdateApplyInput = {
  updateTeamInfo: boolean;
  selectedUpdatedMemberIds: string[];
  selectedNewMemberIndexes: number[];
  missingMemberIdsToRemove: string[];
  deleteRemovedAgents: boolean;
};

export function useTeamActions(
  actions: ActionMessages,
  refetch: RefetchCallbacks,
) {
  const queryClient = useQueryClient();
  const teamsQuery = useTeamsQuery();
  const personasQuery = usePersonasQuery();
  const managedAgentsQuery = useManagedAgentsQuery();
  const availableRuntimesQuery = useAvailableAcpRuntimes();
  const createTeamMutation = useCreateTeamMutation();
  const updateTeamMutation = useUpdateTeamMutation();
  const deleteTeamMutation = useDeleteTeamMutation();

  const exportTeamJsonMutation = useMutation({
    mutationFn: (id: string) => exportTeamToJson(id),
  });

  const [teamDialogState, setTeamDialogState] =
    React.useState<TeamDialogState>(null);
  const [teamToDelete, setTeamToDelete] = React.useState<AgentTeam | null>(
    null,
  );
  const [teamToAddToChannel, setTeamToAddToChannel] =
    React.useState<AgentTeam | null>(null);
  const [teamImportPreview, setTeamImportPreview] = React.useState<{
    preview: ParsedTeamPreview;
    fileName: string;
  } | null>(null);
  const [teamImportTarget, setTeamImportTarget] =
    React.useState<AgentTeam | null>(null);
  const [teamImportTargetPreview, setTeamImportTargetPreview] = React.useState<{
    preview: ParsedTeamPreview;
    fileName: string;
  } | null>(null);
  const [isApplyingTeamImportUpdate, setIsApplyingTeamImportUpdate] =
    React.useState(false);

  const teams = teamsQuery.data ?? [];

  async function getImportRuntimes(): Promise<AcpRuntime[]> {
    if (availableRuntimesQuery.isFetched) {
      return availableRuntimesQuery.data ?? [];
    }
    const result = await availableRuntimesQuery.refetch();
    return (result.data ?? []).filter(
      (runtime): runtime is AcpRuntime => runtime.availability === "available",
    );
  }

  async function handleTeamSubmit(input: CreateTeamInput | UpdateTeamInput) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);

    try {
      if ("id" in input) {
        await updateTeamMutation.mutateAsync(input);
        actions.setActionNoticeMessage(`Updated team "${input.name}".`);
      } else {
        await createTeamMutation.mutateAsync(input);
        actions.setActionNoticeMessage(`Created team "${input.name}".`);
      }
      setTeamDialogState(null);
    } catch (error) {
      actions.setActionErrorMessage(
        error instanceof Error ? error.message : "Failed to save team.",
      );
    }
  }

  async function handleDeleteTeam(team: AgentTeam) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);

    try {
      await deleteTeamMutation.mutateAsync(team.id);
      actions.setActionNoticeMessage(`Deleted team "${team.name}".`);
      setTeamToDelete(null);
    } catch (error) {
      actions.setActionErrorMessage(
        error instanceof Error ? error.message : "Failed to delete team.",
      );
    }
  }

  function handleTeamDeployed(
    channel: Channel,
    result: CreateChannelManagedAgentsResult,
  ) {
    actions.setActionErrorMessage(null);
    const successCount = result.successes.length;
    const failCount = result.failures.length;
    if (failCount === 0) {
      actions.setActionNoticeMessage(
        `Deployed ${successCount} ${successCount === 1 ? "agent" : "agents"} to ${channel.name}.`,
      );
    } else {
      actions.setActionNoticeMessage(
        `Deployed ${successCount} ${successCount === 1 ? "agent" : "agents"} to ${channel.name}. ${failCount} failed.`,
      );
    }
    setTeamToAddToChannel(null);
    refetch.refetchManagedAgents();
    refetch.refetchRelayAgents();
  }

  function openCreateDialog() {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    setTeamDialogState({
      title: "Create team",
      description: "Group agents together for quick deployment to channels.",
      submitLabel: "Create team",
      initialValues: {
        name: "",
        description: "",
        personaIds: [],
        agentPubkeys: [],
      },
    });
  }

  function openDuplicateDialog(team: AgentTeam) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    setTeamDialogState({
      title: `Duplicate ${team.name}`,
      description: "Create a new team by copying this one.",
      submitLabel: "Create team",
      initialValues: {
        name: `${team.name} copy`,
        description: team.description ?? "",
        personaIds: [...team.personaIds],
        agentPubkeys: [...team.agentPubkeys],
      },
    });
  }

  function handleExportTeam(team: AgentTeam) {
    exportTeamJsonMutation.mutate(team.id, {
      onSuccess: (saved) => {
        if (saved) {
          actions.setActionNoticeMessage(`Exported team "${team.name}".`);
        }
      },
      onError: (err) => {
        actions.setActionErrorMessage(
          err instanceof Error ? err.message : "Failed to export team.",
        );
      },
    });
  }

  async function handleImportFile(fileBytes: number[], fileName: string) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    try {
      const preview = await parseTeamFile(fileBytes, fileName);
      setTeamImportPreview({ preview, fileName });
    } catch (err) {
      actions.setActionErrorMessage(
        err instanceof Error ? err.message : "Failed to parse team file.",
      );
    }
  }

  async function handleInstallFromDirectory() {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    try {
      const path = await pickTeamDirectory();
      if (!path) return;
      const team = await installTeamFromDirectory(path, true);
      actions.setActionNoticeMessage(
        `Installed team "${team.name}" from directory.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamsQueryKey }),
        queryClient.invalidateQueries({ queryKey: personasQueryKey }),
        queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey }),
      ]);
      setTeamDialogState(null);
    } catch (err) {
      actions.setActionErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to install team from directory.",
      );
    }
  }

  async function handleSyncTeam(team: AgentTeam) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    try {
      const result = await syncTeamDirectory(team.id);
      const changes = [
        result.personas_added.length > 0 &&
          `${result.personas_added.length} added`,
        result.personas_updated.length > 0 &&
          `${result.personas_updated.length} updated`,
        result.personas_removed.length > 0 &&
          `${result.personas_removed.length} removed`,
      ].filter(Boolean);
      const summary =
        changes.length > 0 ? changes.join(", ") : "already up to date";
      actions.setActionNoticeMessage(`Synced "${team.name}": ${summary}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: teamsQueryKey }),
        queryClient.invalidateQueries({ queryKey: personasQueryKey }),
        queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey }),
      ]);
    } catch (err) {
      actions.setActionErrorMessage(
        err instanceof Error ? err.message : "Failed to sync team directory.",
      );
    }
  }

  function handleRevealInFinder(team: AgentTeam) {
    if (!team.sourceDir) return;
    void revealItemInDir(team.sourceDir);
  }

  async function handleEditDialogImportUpdateFile(
    teamId: string,
    fileBytes: number[],
    fileName: string,
  ) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);

    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) {
      const message = "Team not found. Refresh and try again.";
      actions.setActionErrorMessage(message);
      throw new Error(message);
    }

    try {
      const preview = await parseTeamFile(fileBytes, fileName);
      setTeamImportTarget(team);
      setTeamImportTargetPreview({ preview, fileName });
      setTeamDialogState(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to parse team file.";
      actions.setActionErrorMessage(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  function closeImportUpdateDialog() {
    setTeamImportTarget(null);
    setTeamImportTargetPreview(null);
    setIsApplyingTeamImportUpdate(false);
  }

  function clearImportUpdateAndReturnToEdit() {
    if (!teamImportTarget) {
      closeImportUpdateDialog();
      return;
    }

    const team = teamImportTarget;
    closeImportUpdateDialog();
    openEditDialog(team);
  }

  async function handleTeamImportUpdateApply({
    updateTeamInfo,
    selectedUpdatedMemberIds,
    selectedNewMemberIndexes,
    missingMemberIdsToRemove,
    deleteRemovedAgents,
  }: TeamImportUpdateApplyInput) {
    if (!teamImportTarget || !teamImportTargetPreview) {
      throw new Error("No team import update is currently open.");
    }

    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    setIsApplyingTeamImportUpdate(true);

    const personas = personasQuery.data ?? [];
    const agents = managedAgentsQuery.data ?? [];
    const plan = buildTeamImportPlan({
      team: teamImportTarget,
      personas,
      agents,
      preview: teamImportTargetPreview.preview,
    });
    const selectedUpdatedMemberIdSet = new Set(selectedUpdatedMemberIds);
    const selectedNewMemberIndexSet = new Set(selectedNewMemberIndexes);
    const removeMemberIdSet = new Set(missingMemberIdsToRemove);

    try {
      let updatedMembersCount = 0;
      for (const member of plan.membersToUpdate) {
        if (!selectedUpdatedMemberIdSet.has(member.existing.id)) {
          continue;
        }
        if (member.existing.kind === "persona") {
          const persona = personas.find((p) => p.id === member.existing.id);
          await updatePersona({
            id: member.existing.id,
            displayName: member.imported.display_name,
            systemPrompt: member.imported.system_prompt,
            avatarUrl: member.imported.avatar_url ?? undefined,
            runtime: persona?.runtime ?? undefined,
            model: persona?.model ?? undefined,
            namePool: persona ? [...persona.namePool] : [],
          });
        } else {
          await updateManagedAgent({
            pubkey: member.existing.id,
            name: member.imported.display_name,
            systemPrompt: member.imported.system_prompt || undefined,
          });
        }
        updatedMembersCount += 1;
      }

      // New members are created as (stopped) managed agents.
      const runtimes = await getImportRuntimes();
      const createdPubkeysByImportedIndex = new Map<number, string>();
      for (const member of plan.newMembers) {
        if (!selectedNewMemberIndexSet.has(member.importedIndex)) {
          continue;
        }
        const runtime = runtimes[0];
        if (!runtime) {
          throw new Error(
            "No available agent runtime found. Visit Settings > Doctor to set one up.",
          );
        }
        const created = await createManagedAgent({
          name: member.imported.display_name,
          acpCommand: "buzz-acp",
          agentCommand: runtime.command,
          agentArgs: runtime.defaultArgs,
          mcpCommand: runtime.mcpCommand ?? "",
          systemPrompt: member.imported.system_prompt || undefined,
          avatarUrl: member.imported.avatar_url ?? undefined,
          spawnAfterCreate: false,
          startOnAppLaunch: false,
          backend: { type: "local" },
        });
        createdPubkeysByImportedIndex.set(
          member.importedIndex,
          created.agent.pubkey,
        );
      }

      const nextPersonaIds: string[] = [];
      const nextAgentPubkeys: string[] = [];
      const pushMember = (kind: "agent" | "persona", id: string) => {
        if (kind === "persona") {
          nextPersonaIds.push(id);
        } else {
          nextAgentPubkeys.push(id);
        }
      };

      for (const member of plan.matchedMembers) {
        pushMember(member.existing.kind, member.existing.id);
      }
      for (const pubkey of createdPubkeysByImportedIndex.values()) {
        pushMember("agent", pubkey);
      }

      const removedMembers = plan.missingMembers.filter((member) =>
        removeMemberIdSet.has(member.existing.id),
      );
      const keptMissingMembers = plan.missingMembers.filter(
        (member) => !removeMemberIdSet.has(member.existing.id),
      );
      for (const member of keptMissingMembers) {
        pushMember(member.existing.kind, member.existing.id);
      }

      const nextTeamName = updateTeamInfo
        ? teamImportTargetPreview.preview.name
        : teamImportTarget.name;
      const nextTeamDescription = updateTeamInfo
        ? (teamImportTargetPreview.preview.description ?? undefined)
        : (teamImportTarget.description ?? undefined);

      await updateTeamMutation.mutateAsync({
        id: teamImportTarget.id,
        name: nextTeamName,
        description: nextTeamDescription,
        personaIds: nextPersonaIds,
        agentPubkeys: nextAgentPubkeys,
      });

      let deletedAgentsCount = 0;
      const deleteFailures: string[] = [];
      const addedMembersCount = createdPubkeysByImportedIndex.size;
      if (deleteRemovedAgents && removedMembers.length > 0) {
        for (const member of removedMembers) {
          try {
            if (member.existing.kind === "persona") {
              await deletePersona(member.existing.id);
            } else {
              await deleteManagedAgent(member.existing.id);
            }
            deletedAgentsCount += 1;
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : String(error);
            deleteFailures.push(`${member.existing.displayName}: ${reason}`);
          }
        }
      }

      actions.setActionNoticeMessage(
        `Updated "${nextTeamName}" from import. ${updatedMembersCount} member${updatedMembersCount === 1 ? "" : "s"} updated, ${addedMembersCount} added, ${removedMembers.length} removed from the team${deleteRemovedAgents ? `, and ${deletedAgentsCount} deleted` : ""}.`,
      );

      if (deleteFailures.length > 0) {
        actions.setActionErrorMessage(
          `Team updated, but ${deleteFailures.length} agent${deleteFailures.length === 1 ? "" : "s"} could not be removed: ${deleteFailures.join("; ")}`,
        );
      }

      closeImportUpdateDialog();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: personasQueryKey }),
        queryClient.invalidateQueries({ queryKey: teamsQueryKey }),
        queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey }),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to apply imported team update.";
      actions.setActionErrorMessage(message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setIsApplyingTeamImportUpdate(false);
    }
  }

  function handleTeamImportComplete(
    teamName: string,
    teamDescription: string | null,
    agentPubkeys: string[],
  ) {
    setTeamImportPreview(null);
    void (async () => {
      const teamInput = {
        name: teamName,
        description: teamDescription ?? undefined,
        personaIds: [],
        agentPubkeys,
      };

      // Try creating the team, retry once on failure.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await createTeamApi(teamInput);
          actions.setActionNoticeMessage(
            `Imported team "${teamName}" with ${agentPubkeys.length} agent${agentPubkeys.length !== 1 ? "s" : ""}.`,
          );
          void queryClient.invalidateQueries({
            queryKey: managedAgentsQueryKey,
          });
          void queryClient.invalidateQueries({ queryKey: teamsQueryKey });
          return;
        } catch {
          if (attempt === 0) continue;
        }
      }

      // Both attempts failed — agents exist but team doesn't.
      actions.setActionErrorMessage(
        `Imported ${agentPubkeys.length} agent${agentPubkeys.length !== 1 ? "s" : ""} but failed to create team "${teamName}". The agents are saved — create a team manually to group them.`,
      );
      void queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey });
    })();
  }

  async function handleDeleteRemovedMembers(members: RemovedTeamMemberRef[]) {
    for (const member of members) {
      try {
        if (member.kind === "persona") {
          await deletePersona(member.id);
        } else {
          await deleteManagedAgent(member.id);
        }
      } catch {
        // Best-effort: the member may already be deleted or in use elsewhere.
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: personasQueryKey }),
      queryClient.invalidateQueries({ queryKey: managedAgentsQueryKey }),
    ]);
  }

  function openEditDialog(team: AgentTeam) {
    actions.setActionNoticeMessage(null);
    actions.setActionErrorMessage(null);
    setTeamDialogState({
      title: "Edit team",
      description: "",
      submitLabel: "Save changes",
      initialValues: {
        id: team.id,
        name: team.name,
        description: team.description ?? "",
        personaIds: [...team.personaIds],
        agentPubkeys: [...team.agentPubkeys],
      },
    });
  }

  return {
    teams,
    teamsQuery,
    createTeamMutation,
    updateTeamMutation,
    deleteTeamMutation,
    exportTeamJsonMutation,
    teamDialogState,
    setTeamDialogState,
    teamToDelete,
    setTeamToDelete,
    teamToAddToChannel,
    setTeamToAddToChannel,
    teamImportPreview,
    setTeamImportPreview,
    teamImportTarget,
    teamImportTargetPreview,
    isApplyingTeamImportUpdate,
    handleTeamSubmit,
    handleDeleteRemovedMembers,
    handleDeleteTeam,
    handleTeamDeployed,
    handleExportTeam,
    handleImportFile,
    handleInstallFromDirectory,
    handleSyncTeam,
    handleRevealInFinder,
    handleEditDialogImportUpdateFile,
    handleTeamImportComplete,
    handleTeamImportUpdateApply,
    closeImportUpdateDialog,
    clearImportUpdateAndReturnToEdit,
    openCreateDialog,
    openDuplicateDialog,
    openEditDialog,
  };
}
