import * as React from "react";
import { Users } from "lucide-react";

import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useAvailableAcpRuntimes } from "@/features/agents/hooks";
import type { ParsedTeamPreview } from "@/shared/api/tauriTeams";
import { createManagedAgent } from "@/shared/api/tauri";
import { promptPreview } from "@/shared/lib/promptPreview";
import {
  ImportStatusIcon,
  type ImportItemStatus,
} from "@/shared/ui/import-status-icon";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type TeamImportDialogProps = {
  fileName: string;
  open: boolean;
  preview: ParsedTeamPreview | null;
  onOpenChange: (open: boolean) => void;
  onComplete: (
    teamName: string,
    teamDescription: string | null,
    agentPubkeys: string[],
  ) => void;
};

export function TeamImportDialog({
  fileName,
  open,
  preview,
  onOpenChange,
  onComplete,
}: TeamImportDialogProps) {
  const [status, setStatus] = React.useState<
    "idle" | "importing" | "done" | "error"
  >("idle");
  const [importedCount, setImportedCount] = React.useState(0);
  const [itemStatuses, setItemStatuses] = React.useState<
    Map<number, ImportItemStatus>
  >(new Map());
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const runtimesQuery = useAvailableAcpRuntimes({ enabled: open });

  const members = preview?.personas ?? [];

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setStatus("idle");
    setImportedCount(0);
    setItemStatuses(new Map());
    setErrorMessage(null);
  }, [open]);

  async function handleImport() {
    if (!preview || members.length === 0) {
      return;
    }

    const runtime = (runtimesQuery.data ?? [])[0] ?? null;
    if (!runtime) {
      setStatus("error");
      setErrorMessage(
        "No available agent runtime found. Visit Settings > Doctor to set one up.",
      );
      return;
    }

    setStatus("importing");
    setErrorMessage(null);

    const initialStatuses = new Map<number, ImportItemStatus>();
    for (let i = 0; i < members.length; i++) {
      initialStatuses.set(i, "pending");
    }
    setItemStatuses(new Map(initialStatuses));

    const agentPubkeys: string[] = [];
    let completed = 0;

    for (let i = 0; i < members.length; i++) {
      const member = members[i];

      setItemStatuses((prev) => {
        const next = new Map(prev);
        next.set(i, "importing");
        return next;
      });

      try {
        // Imported team members are created stopped so a large team never
        // spawns a fleet of processes at once.
        const created = await createManagedAgent({
          name: member.display_name,
          acpCommand: "buzz-acp",
          agentCommand: runtime.command,
          agentArgs: runtime.defaultArgs,
          mcpCommand: runtime.mcpCommand ?? "",
          systemPrompt: member.system_prompt || undefined,
          avatarUrl: member.avatar_url ?? undefined,
          spawnAfterCreate: false,
          startOnAppLaunch: false,
          backend: { type: "local" },
        });
        agentPubkeys.push(created.agent.pubkey);
        completed += 1;
        setImportedCount(completed);
        setItemStatuses((prev) => {
          const next = new Map(prev);
          next.set(i, "done");
          return next;
        });
      } catch (error) {
        setItemStatuses((prev) => {
          const next = new Map(prev);
          next.set(i, "error");
          return next;
        });
        setStatus("error");
        setErrorMessage(
          `Imported ${completed} of ${members.length} agents. Failed on '${member.display_name}': ${error instanceof Error ? error.message : String(error)}. Already-imported agents are saved.`,
        );
        return;
      }
    }

    setStatus("done");
    onComplete(preview.name, preview.description, agentPubkeys);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5 pr-14">
          <DialogTitle>Import team</DialogTitle>
          <DialogDescription>
            Preview the team from {fileName || "file"} before importing.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {preview ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/80 px-4 py-3">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight">
                    {preview.name}
                  </p>
                  {preview.description ? (
                    <p className="text-xs text-muted-foreground">
                      {preview.description}
                    </p>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {members.length} {members.length === 1 ? "agent" : "agents"}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Agents to import</p>
                <p className="text-xs text-muted-foreground">
                  Each agent will be created, then grouped into a new team.
                </p>
              </div>

              <div className="space-y-1">
                {members.map((persona, index) => (
                  <div
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/80 px-3 py-2.5"
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list from imported JSON file, never reordered
                    key={index}
                  >
                    <ProfileAvatar
                      avatarUrl={persona.avatar_url}
                      className="h-8 w-8 rounded-lg text-xs"
                      label={persona.display_name}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-tight">
                        {persona.display_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {promptPreview(persona.system_prompt)}
                      </p>
                    </div>
                    <ImportStatusIcon status={itemStatuses.get(index)} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={
              !preview ||
              members.length === 0 ||
              status === "importing" ||
              status === "done" ||
              status === "error"
            }
            onClick={() => void handleImport()}
            size="sm"
            type="button"
          >
            {status === "importing"
              ? `Importing ${importedCount}/${members.length}...`
              : `Import team (${members.length} agent${members.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
