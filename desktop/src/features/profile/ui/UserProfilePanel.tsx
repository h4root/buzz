import * as React from "react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  useAgentMemoryQuery,
  useIsManagedAgent,
} from "@/features/agent-memory/hooks";
import {
  type AttachManagedAgentToChannelResult,
  useDeleteManagedAgentMutation,
  useExportAgentJsonMutation,
  useManagedAgentLogQuery,
  useRelayAgentsQuery,
  useManagedAgentsQuery,
  usePersonasQuery,
  useSetManagedAgentStartOnAppLaunchMutation,
  useStartManagedAgentMutation,
  useStopManagedAgentMutation,
} from "@/features/agents/hooks";
import { AddAgentToChannelDialog } from "@/features/agents/ui/AddAgentToChannelDialog";
import { useActiveAgentTurnsBridge } from "@/features/agents/activeAgentTurnsStore";
import { duplicateAgentDraft } from "@/features/agents/ui/agentDraft";
import { requestOpenCreateAgent } from "@/features/agents/openCreateAgentEvent";
import {
  isManagedAgentActive,
  startManagedAgentWithRules,
  stopManagedAgentWithRules,
} from "@/features/agents/lib/managedAgentControlActions";
import { useManagedAgentObserverBridge } from "@/features/agents/observerRelayStore";
import { describeLogFile } from "@/features/agents/ui/agentUi";
import { EditAgentDialog } from "@/features/agents/ui/EditAgentDialog";
import { useChannelsQuery } from "@/features/channels/hooks";
import { useIdentityArchive } from "@/features/identity-archive/hooks";
import { usePresenceQuery } from "@/features/presence/hooks";
import {
  useContactListQuery,
  useFollowMutation,
  useProfileQuery,
  useUnfollowMutation,
  useUserProfileQuery,
  useUsersBatchQuery,
} from "@/features/profile/hooks";
import {
  AgentInfoFocusedView,
  AgentInstructionsFocusedView,
  ChannelsFocusedView,
  DiagnosticsFocusedView,
  MemoryFocusedView,
  ProfileSummaryView,
} from "@/features/profile/ui/UserProfilePanelSections";
import { AgentConfigurationFocusedView } from "@/features/profile/ui/UserProfilePanelAgentDetails";
import { UserProfileAgentSettingsMenuSlot } from "@/features/profile/ui/UserProfileAgentActions";
import { useProfileAgentDeletion } from "@/features/profile/ui/UserProfilePanelDeletion";
import { useProfileFieldBuckets } from "@/features/profile/ui/UserProfilePanelFields";
import {
  deriveProfileChannels,
  type ProfilePanelTab,
  type ProfilePanelView,
  resolveAgentInstruction,
  resolvePanelProfile,
  resolveProfileDisplayName,
  truncatePubkey,
  type UserProfilePanelProps,
  useRetainedPersona,
} from "@/features/profile/ui/UserProfilePanelUtils";
import { useProfileDmAction } from "@/features/profile/ui/useProfileDmAction";
import { useUserStatusQuery } from "@/features/user-status/hooks";
import { useAgentSession } from "@/shared/context/AgentSessionContext";
import { useEscapeKey } from "@/shared/hooks/useEscapeKey";
import { useIsThreadPanelOverlay } from "@/shared/hooks/use-mobile";
import { AuxiliaryPanelBody } from "@/shared/layout/AuxiliaryPanel";
import { cn } from "@/shared/lib/cn";
import type { Channel, ManagedAgent } from "@/shared/api/types";
import { UserProfilePanelFrame } from "@/features/profile/ui/UserProfilePanelFrame";
import { getUserProfilePanelHeaderContent } from "@/features/profile/ui/UserProfilePanelHeaderContent";
export type { ProfilePanelTab, ProfilePanelView };

export function UserProfilePanel({
  canResetWidth,
  currentPubkey,
  isSinglePanelView = false,
  layout = "standalone",
  onClose,
  onOpenDm,
  onOpenProfile,
  onResetWidth,
  onResizeStart,
  onTabChange,
  onViewChange,
  pubkey,
  splitPaneClamp = false,
  tab: controlledTab,
  view: controlledView,
  widthPx,
  transparentChrome = false,
}: UserProfilePanelProps) {
  const isOverlay = useIsThreadPanelOverlay();
  const isSplitLayout = layout === "split";
  useEscapeKey(onClose, isOverlay || isSinglePanelView);

  const [internalView, setInternalView] =
    React.useState<ProfilePanelView>("summary");
  const view = controlledView ?? internalView;
  const setView = React.useCallback(
    (nextView: ProfilePanelView, options?: { replace?: boolean }) => {
      if (onViewChange) {
        onViewChange(nextView, options);
        return;
      }
      setInternalView(nextView);
    },
    [onViewChange],
  );
  const [internalTab, setInternalTab] = React.useState<ProfilePanelTab>("info");
  const tab = controlledTab ?? internalTab;
  const setTab = React.useCallback(
    (nextTab: ProfilePanelTab, options?: { replace?: boolean }) => {
      if (onTabChange) {
        onTabChange(nextTab, options);
        return;
      }
      setInternalTab(nextTab);
    },
    [onTabChange],
  );
  const [editAgentOpen, setEditAgentOpen] = React.useState(false);
  const [addToChannelOpen, setAddToChannelOpen] = React.useState(false);

  const personasQuery = usePersonasQuery();
  const managedAgentsQuery = useManagedAgentsQuery({ enabled: true });
  const managedAgent = React.useMemo(() => {
    const agents = managedAgentsQuery.data ?? [];
    if (pubkey) {
      const pubkeyLower = pubkey.toLowerCase();
      return agents.find((agent) => agent.pubkey.toLowerCase() === pubkeyLower);
    }
    return undefined;
  }, [managedAgentsQuery.data, pubkey]);
  const resolvedPersonaFromSource = React.useMemo(() => {
    if (!managedAgent?.personaId) {
      return undefined;
    }
    return personasQuery.data?.find(
      (candidate) => candidate.id === managedAgent.personaId,
    );
  }, [managedAgent?.personaId, personasQuery.data]);
  const profileIdentityKey = pubkey ?? managedAgent?.pubkey ?? "unknown";
  const resolvedPersona = useRetainedPersona(
    resolvedPersonaFromSource,
    profileIdentityKey,
  );
  const effectivePubkey = pubkey ?? managedAgent?.pubkey ?? null;
  const pubkeyLower = effectivePubkey?.toLowerCase() ?? "";

  const profileQuery = useUserProfileQuery(effectivePubkey ?? undefined);
  const currentProfileQuery = useProfileQuery(currentPubkey !== undefined);

  React.useEffect(() => {
    if (!effectivePubkey) return;
    void profileQuery.refetch();
  }, [effectivePubkey, profileQuery.refetch]);

  const relayAgentsQuery = useRelayAgentsQuery({ enabled: true });
  const startAgentMutation = useStartManagedAgentMutation();
  const stopAgentMutation = useStopManagedAgentMutation();
  const deleteAgentMutation = useDeleteManagedAgentMutation();
  const startOnLaunchMutation = useSetManagedAgentStartOnAppLaunchMutation();
  const exportAgentJsonMutation = useExportAgentJsonMutation();
  const usersBatchQuery = useUsersBatchQuery(
    effectivePubkey ? [effectivePubkey] : [],
  );
  const channelsQuery = useChannelsQuery();
  const presenceQuery = usePresenceQuery(
    effectivePubkey ? [effectivePubkey] : [],
  );
  const userStatusQuery = useUserStatusQuery(
    effectivePubkey ? [effectivePubkey] : [],
  );
  const contactListQuery = useContactListQuery(currentPubkey);
  const followMutation = useFollowMutation(currentPubkey);
  const unfollowMutation = useUnfollowMutation(currentPubkey);
  const { onOpenAgentSession } = useAgentSession();
  const { goAgents, goChannel } = useAppNavigation();
  const profile = resolvePanelProfile({
    managedAgent,
    persona: resolvedPersona,
    profile: profileQuery.data,
  });
  const ownerPubkey = profile?.ownerPubkey ?? null;
  const ownerProfileQuery = useUserProfileQuery(ownerPubkey ?? undefined);
  const presenceStatus = pubkeyLower
    ? presenceQuery.data?.[pubkeyLower]
    : undefined;
  const userStatus = pubkeyLower
    ? userStatusQuery.data?.[pubkeyLower]
    : undefined;

  const relayAgent = relayAgentsQuery.data?.find(
    (agent) => agent.pubkey.toLowerCase() === pubkeyLower,
  );
  const managedAgentLogQuery = useManagedAgentLogQuery(
    (view === "diagnostics" || view === "logs") &&
      managedAgent?.backend.type === "local"
      ? managedAgent.pubkey
      : null,
  );
  const isAgentByOaOwner = Boolean(
    usersBatchQuery.data?.profiles[pubkeyLower]?.isAgent,
  );
  const isBot =
    Boolean(relayAgent || managedAgent || resolvedPersona) || isAgentByOaOwner;
  const managedAgentOwner = useIsManagedAgent(isBot ? effectivePubkey : null);
  // Does THIS desktop hold the agent's seckey? Gates edit (which needs the
  // key) and grants owner access when managed locally.
  const isOwner = managedAgentOwner;
  // Is the viewer the agent's declared owner (NIP-OA `ownerPubkey == me`)? This
  // is the right signal for viewing owner-scoped data (activity feed, memory):
  // the relay routes and the client decrypts those frames with the owner's OWN
  // key, so the agent's seckey is never needed. Computed here (before the gates
  // that consume it) so visibility keys off declared ownership, not key custody.
  const isCurrentUserOwner =
    currentPubkey !== undefined &&
    ownerPubkey !== null &&
    ownerPubkey.toLowerCase() === currentPubkey.toLowerCase();
  // The viewer may see owner-scoped data if they declared-own the agent OR they
  // manage it locally (older agents may not advertise an owner pubkey). Every
  // real boundary is server-side, so this only controls what UI we paint.
  const viewerIsOwner = isCurrentUserOwner || isOwner === true;

  // Populate the active-turns store for this agent so useActiveAgentTurns works
  // even if the Agents page hasn't been visited yet.
  const bridgeAgents = React.useMemo(
    () =>
      managedAgent
        ? [{ pubkey: managedAgent.pubkey, status: managedAgent.status }]
        : [],
    [managedAgent],
  );
  // The observer bridge subscribes on the OWNER's own pubkey and decrypts the
  // agent's telemetry with the owner's key — no agent seckey needed. It only
  // decrypts frames whose agent pubkey is "known", and only subscribes when an
  // agent is running/deployed. For a remote agent we own but don't manage
  // locally, `managedAgent` is undefined, so we seed the bridge from the relay
  // agent (treated as "deployed") when the viewer is the declared owner. This
  // mirrors what the composer-area ingress already does in ChannelScreen.
  const observerBridgeAgents = React.useMemo(() => {
    if (managedAgent) {
      return [{ pubkey: managedAgent.pubkey, status: managedAgent.status }];
    }
    if (viewerIsOwner && relayAgent) {
      return [
        {
          pubkey: relayAgent.pubkey,
          status: "deployed" as ManagedAgent["status"],
        },
      ];
    }
    return [];
  }, [managedAgent, relayAgent, viewerIsOwner]);
  useActiveAgentTurnsBridge(bridgeAgents);
  useManagedAgentObserverBridge(observerBridgeAgents);
  const canEditAgent = isOwner === true && managedAgent !== undefined;
  const memoryQuery = useAgentMemoryQuery(effectivePubkey, {
    enabled: viewerIsOwner && Boolean(effectivePubkey),
  });
  const isSelf =
    currentPubkey !== undefined &&
    pubkeyLower.length > 0 &&
    pubkeyLower === currentPubkey.toLowerCase();
  const canViewActivity =
    viewerIsOwner && Boolean(onOpenAgentSession) && Boolean(effectivePubkey);
  const canOpenAgentLogs =
    isOwner === true && managedAgent?.backend.type === "local";
  const isAgentActionPending =
    startAgentMutation.isPending ||
    stopAgentMutation.isPending ||
    deleteAgentMutation.isPending ||
    startOnLaunchMutation.isPending ||
    exportAgentJsonMutation.isPending;
  const isFollowing =
    !isSelf &&
    pubkeyLower.length > 0 &&
    (contactListQuery.data?.contacts.some(
      (contact) => contact.pubkey.toLowerCase() === pubkeyLower,
    ) ??
      false);

  const profileChannels = React.useMemo(
    () =>
      deriveProfileChannels(
        pubkeyLower,
        relayAgent,
        managedAgent,
        channelsQuery.data,
      ),
    [pubkeyLower, relayAgent, managedAgent, channelsQuery.data],
  );

  const channelIdToName = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const channel of channelsQuery.data ?? []) {
      map[channel.id] = channel.name;
    }
    return map;
  }, [channelsQuery.data]);

  const targetKey = effectivePubkey ?? "unknown";
  const prevTargetKeyRef = React.useRef(targetKey);
  React.useEffect(() => {
    if (prevTargetKeyRef.current === targetKey) return;
    prevTargetKeyRef.current = targetKey;
    setView("summary", { replace: true });
    setTab("info", { replace: true });
  }, [setTab, setView, targetKey]);
  const { handleMessage, isOpeningDm } = useProfileDmAction({
    effectivePubkey,
    onClose,
    onOpenDm,
  });

  const handleEditAgent = React.useCallback(() => {
    setEditAgentOpen(true);
  }, []);

  const { deleteManagedAgentRecord } = useProfileAgentDeletion({
    channels: channelsQuery.data,
    deleteManagedAgent: deleteAgentMutation.mutateAsync,
    presenceLookup: presenceQuery.data,
    relayAgents: relayAgentsQuery.data,
  });

  const handleAgentPrimaryAction = React.useCallback(async () => {
    if (!managedAgent) return;

    try {
      if (isManagedAgentActive(managedAgent)) {
        const result = await stopManagedAgentWithRules({
          agent: managedAgent,
          channels: channelsQuery.data ?? [],
          relayAgents: relayAgentsQuery.data ?? [],
          stopManagedAgent: stopAgentMutation.mutateAsync,
        });
        toast.success(result.noticeMessage ?? `Stopped ${managedAgent.name}.`);
        return;
      }

      await startManagedAgentWithRules({
        agent: managedAgent,
        startManagedAgent: startAgentMutation.mutateAsync,
      });
      toast.success(
        managedAgent.backend.type === "provider"
          ? `Deploying ${managedAgent.name}.`
          : `Started ${managedAgent.name}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Agent action failed.",
      );
    }
  }, [
    channelsQuery.data,
    managedAgent,
    relayAgentsQuery.data,
    startAgentMutation.mutateAsync,
    stopAgentMutation.mutateAsync,
  ]);

  const handleToggleAgentAutoStart = React.useCallback(async () => {
    if (managedAgent?.backend.type !== "local") return;

    try {
      const updated = await startOnLaunchMutation.mutateAsync({
        pubkey: managedAgent.pubkey,
        startOnAppLaunch: !managedAgent.startOnAppLaunch,
      });
      toast.success(
        updated.startOnAppLaunch
          ? `Will start ${updated.name} automatically.`
          : `${updated.name} will stay manual-start only.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update startup preference.",
      );
    }
  }, [managedAgent, startOnLaunchMutation.mutateAsync]);

  const handleDeleteAgent = React.useCallback(async () => {
    if (!managedAgent) return;

    try {
      const result = await deleteManagedAgentRecord(managedAgent);
      if (result.cancelled) return;

      toast.success(`Deleted ${managedAgent.name}.`);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete agent.",
      );
    }
  }, [deleteManagedAgentRecord, managedAgent, onClose]);

  const handleDuplicateAgent = React.useCallback(() => {
    if (!managedAgent) return;
    requestOpenCreateAgent(duplicateAgentDraft(managedAgent));
    onClose();
    void goAgents();
  }, [goAgents, managedAgent, onClose]);

  const handleExportAgent = React.useCallback(() => {
    if (!managedAgent) return;
    exportAgentJsonMutation.mutate(managedAgent.pubkey, {
      onSuccess: (saved) => {
        if (saved) {
          toast.success(`Exported ${managedAgent.name}.`);
        }
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to export agent.",
        );
      },
    });
  }, [exportAgentJsonMutation, managedAgent]);

  const handleAddedToChannel = React.useCallback(
    (channel: Channel, result: AttachManagedAgentToChannelResult) => {
      if (result.started) {
        toast.success(`Added ${result.agent.name} to ${channel.name}.`);
      } else if (result.membershipAdded) {
        toast.success(`Added ${result.agent.name} to ${channel.name}.`);
      } else {
        toast.success(`${result.agent.name} is already in ${channel.name}.`);
      }
      void managedAgentsQuery.refetch();
      void relayAgentsQuery.refetch();
      void channelsQuery.refetch();
    },
    [
      channelsQuery.refetch,
      managedAgentsQuery.refetch,
      relayAgentsQuery.refetch,
    ],
  );

  const handleOpenActivity = React.useCallback(() => {
    if (!effectivePubkey) return;
    onOpenAgentSession?.(effectivePubkey);
  }, [effectivePubkey, onOpenAgentSession]);

  const handleOpenChannel = React.useCallback(
    (channelId: string) => {
      void goChannel(channelId);
    },
    [goChannel],
  );

  const displayName = resolveProfileDisplayName({
    persona: resolvedPersona,
    profile,
    pubkey: effectivePubkey,
  });
  const ownerHandle = React.useMemo(() => {
    if (ownerPubkey) {
      const ownerProfile = ownerProfileQuery.data;
      return (
        ownerProfile?.nip05Handle?.trim() ||
        ownerProfile?.displayName?.trim() ||
        truncatePubkey(ownerPubkey)
      );
    }

    if (currentPubkey === undefined || isOwner !== true) {
      return null;
    }

    const currentProfile = currentProfileQuery.data;
    return (
      currentProfile?.nip05Handle?.trim() ||
      currentProfile?.displayName?.trim() ||
      truncatePubkey(currentPubkey)
    );
  }, [
    currentProfileQuery.data,
    currentPubkey,
    isOwner,
    ownerProfileQuery.data,
    ownerPubkey,
  ]);
  const ownerDisplayName = ownerHandle
    ? isCurrentUserOwner || (!ownerPubkey && isOwner === true)
      ? `${ownerHandle} (you)`
      : ownerHandle
    : null;
  const ownerProfilePubkey =
    ownerPubkey ?? (isOwner === true ? (currentPubkey ?? null) : null);
  const ownerAvatarProfile = ownerPubkey
    ? ownerProfileQuery.data
    : currentProfileQuery.data;
  const memoryCount =
    memoryQuery.data &&
    (memoryQuery.data.core ? 1 : 0) + memoryQuery.data.memories.length;
  const agentInstruction = resolveAgentInstruction(
    managedAgent,
    resolvedPersona,
  );
  const canManageAgent = isOwner === true && managedAgent !== undefined;
  const archiveActions = useIdentityArchive(effectivePubkey);
  const agentSettingsMenu = (
    <UserProfileAgentSettingsMenuSlot
      archiveActions={archiveActions}
      canManageAgent={canManageAgent}
      isAgentActionPending={isAgentActionPending}
      isBot={isBot}
      managedAgent={managedAgent}
      onDeleteAgent={handleDeleteAgent}
      onDuplicateAgent={handleDuplicateAgent}
      onExportAgent={handleExportAgent}
      onToggleAutoStart={handleToggleAgentAutoStart}
      viewerIsOwner={viewerIsOwner}
    />
  );
  const { agentInfoFields, agentSettingsFields, diagnosticsFields } =
    useProfileFieldBuckets({
      isBot,
      isOwner: viewerIsOwner,
      managedAgent,
      onOpenProfile,
      ownerAvatarUrl: ownerAvatarProfile?.avatarUrl ?? null,
      ownerDisplayName,
      ownerHandle,
      ownerProfilePubkey,
      ownerPubkey,
      persona: resolvedPersona,
      presenceLoaded: presenceQuery.isSuccess,
      presenceStatus,
      profile,
      pubkey: effectivePubkey,
      relayAgent,
    });
  const isDiagnosticsLikeView = view === "diagnostics" || view === "logs";
  const managedAgentLogContent = managedAgentLogQuery.data?.content ?? null;
  const logHeaderSubtitle =
    isDiagnosticsLikeView && managedAgent
      ? `${managedAgent.name} · ${describeLogFile(managedAgent.logPath)}`
      : null;
  const { headerActions, headerLeftContent } = getUserProfilePanelHeaderContent(
    {
      agentSettingsMenu,
      effectivePubkey,
      logCopyValue: isDiagnosticsLikeView ? managedAgentLogContent : null,
      logSubtitle: logHeaderSubtitle,
      onBack: () => setView("summary"),
      view,
      viewerIsOwner,
    },
  );

  const profileBody = (
    <AuxiliaryPanelBody
      className={cn(
        "px-4 pb-6",
        isDiagnosticsLikeView
          ? "flex flex-col overflow-hidden"
          : "overflow-y-auto",
      )}
    >
      {view === "summary" ? (
        <ProfileSummaryView
          canAddToChannel={managedAgent !== undefined && isOwner === true}
          canEditAgent={canEditAgent}
          canOpenAgentLogs={canOpenAgentLogs}
          canViewActivity={canViewActivity}
          channelCount={profileChannels.length}
          channelIdToName={channelIdToName}
          channels={profileChannels}
          channelsLoading={channelsQuery.isLoading}
          displayName={displayName}
          followMutation={followMutation}
          agentInstruction={agentInstruction}
          handleAgentPrimaryAction={handleAgentPrimaryAction}
          handleEditAgent={handleEditAgent}
          handleMessage={handleMessage}
          isArchived={archiveActions.isArchived === true}
          isMessagePending={isOpeningDm}
          isBot={isBot}
          isAgentActionPending={isAgentActionPending}
          isFollowing={isFollowing}
          isOwner={viewerIsOwner}
          isSelf={isSelf}
          managedAgent={managedAgent}
          memoriesLoading={memoryQuery.isLoading}
          memoryCount={memoryCount}
          agentInfoFields={agentInfoFields}
          agentSettingsFields={agentSettingsFields}
          diagnosticsFields={diagnosticsFields}
          onAddToChannel={() => setAddToChannelOpen(true)}
          onOpenActivity={handleOpenActivity}
          onOpenChannel={handleOpenChannel}
          onOpenDiagnostics={() => setView("diagnostics")}
          onOpenInstructions={() => setView("instructions")}
          onTabChange={setTab}
          onOpenDm={onOpenDm}
          presenceStatus={presenceStatus}
          profile={profile}
          pubkey={effectivePubkey}
          relayAgent={relayAgent}
          tab={tab}
          unfollowMutation={unfollowMutation}
          userStatus={userStatus}
        />
      ) : null}
      {view === "memories" && effectivePubkey ? (
        <MemoryFocusedView
          agentPubkey={effectivePubkey}
          viewerIsOwner={viewerIsOwner}
        />
      ) : null}
      {view === "info" ? (
        <AgentInfoFocusedView metadataFields={agentInfoFields} />
      ) : null}
      {view === "configuration" ? (
        <AgentConfigurationFocusedView fields={agentSettingsFields} />
      ) : null}
      {view === "instructions" ? (
        <AgentInstructionsFocusedView instruction={agentInstruction} />
      ) : null}
      {view === "diagnostics" ? (
        <DiagnosticsFocusedView
          canOpenAgentLogs={canOpenAgentLogs}
          fields={diagnosticsFields}
          logContent={managedAgentLogContent}
          logError={
            managedAgentLogQuery.error instanceof Error
              ? managedAgentLogQuery.error
              : null
          }
          logLoading={managedAgentLogQuery.isLoading}
          managedAgent={managedAgent}
        />
      ) : null}
      {view === "channels" ? (
        <ChannelsFocusedView
          canAddToChannel={managedAgent !== undefined && isOwner === true}
          channels={profileChannels}
          isActionPending={isAgentActionPending}
          isLoading={channelsQuery.isLoading}
          onAddToChannel={() => setAddToChannelOpen(true)}
          onOpenChannel={handleOpenChannel}
        />
      ) : null}
      {view === "logs" ? (
        <DiagnosticsFocusedView
          canOpenAgentLogs={canOpenAgentLogs}
          fields={[]}
          logContent={managedAgentLogContent}
          logError={
            managedAgentLogQuery.error instanceof Error
              ? managedAgentLogQuery.error
              : null
          }
          logLoading={managedAgentLogQuery.isLoading}
          managedAgent={managedAgent}
        />
      ) : null}
    </AuxiliaryPanelBody>
  );
  const editAgentDialog =
    canEditAgent && managedAgent ? (
      <EditAgentDialog
        agent={managedAgent}
        onOpenChange={setEditAgentOpen}
        open={editAgentOpen}
      />
    ) : null;
  const addAgentToChannelDialog = managedAgent ? (
    <AddAgentToChannelDialog
      agent={managedAgent ?? null}
      onAdded={handleAddedToChannel}
      onOpenChange={setAddToChannelOpen}
      open={addToChannelOpen}
    />
  ) : null;
  return (
    <UserProfilePanelFrame
      addAgentToChannelDialog={addAgentToChannelDialog}
      canResetWidth={canResetWidth}
      editAgentDialog={editAgentDialog}
      headerActions={headerActions}
      headerLeftContent={headerLeftContent}
      isOverlay={isOverlay}
      isSinglePanelView={isSinglePanelView}
      isSplitLayout={isSplitLayout}
      onClose={onClose}
      onResetWidth={onResetWidth}
      onResizeStart={onResizeStart}
      profileBody={profileBody}
      splitPaneClamp={splitPaneClamp}
      widthPx={widthPx}
      transparentChrome={transparentChrome}
    />
  );
}
