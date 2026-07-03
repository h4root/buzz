import { FileUp, Plus } from "lucide-react";

import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useAgentTemplatesQuery } from "@/features/agents/hooks";
import type { AgentTemplate } from "@/shared/api/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useFileImportZone } from "@/shared/hooks/useFileImportZone";

/**
 * Step 1 of the Create Agent wizard: choose a starting point — a blank
 * agent, a built-in starter template, or an imported agent file. Selecting
 * anything hands off to the details step (CreateAgentDialog) prefilled.
 */
export function CreateAgentStartDialog({
  open,
  onImportFile,
  onOpenChange,
  onPickBlank,
  onPickTemplate,
}: {
  open: boolean;
  onImportFile: (fileBytes: number[], fileName: string) => void;
  onOpenChange: (open: boolean) => void;
  onPickBlank: () => void;
  onPickTemplate: (template: AgentTemplate) => void;
}) {
  const templatesQuery = useAgentTemplatesQuery({ enabled: open });
  const templates = templatesQuery.data ?? [];
  const {
    fileInputRef,
    isDragOver,
    dropHandlers,
    handleFileChange,
    openFilePicker,
  } = useFileImportZone({ onImportFile });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <div className="relative flex max-h-[85vh] flex-col" {...dropHandlers}>
          {isDragOver ? (
            <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-background/80 backdrop-blur-sm">
              <p className="text-sm font-medium text-primary">
                Drop an agent file to import
              </p>
            </div>
          ) : null}

          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5 pr-14">
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>
              Choose a starting point. You can adjust everything in the next
              step.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                data-testid="create-agent-start-blank"
                onClick={onPickBlank}
                type="button"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold tracking-tight">
                    Blank agent
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Start from scratch
                  </span>
                </span>
              </button>

              <button
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                data-testid="create-agent-start-import"
                onClick={openFilePicker}
                type="button"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 text-muted-foreground">
                  <FileUp className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold tracking-tight">
                    Import from file
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    .persona.md, .persona.json, .persona.png, or .zip
                  </span>
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Templates
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    onPick={onPickTemplate}
                    template={template}
                  />
                ))}
              </div>
            </div>
          </div>

          <input
            accept=".md,.json,.png,.zip"
            className="hidden"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  onPick,
}: {
  template: AgentTemplate;
  onPick: (template: AgentTemplate) => void;
}) {
  const firstLine = template.systemPrompt
    .trim()
    .split("\n")
    .find((line) => line.trim().length > 0);

  return (
    <button
      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
      data-testid={`create-agent-template-${template.id}`}
      onClick={() => onPick(template)}
      type="button"
    >
      <ProfileAvatar
        avatarUrl={template.avatarUrl}
        className="h-9 w-9 shrink-0 rounded-lg text-xs"
        label={template.displayName}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-tight">
          {template.displayName}
        </span>
        {firstLine ? (
          <span className="block truncate text-xs text-muted-foreground">
            {firstLine}
          </span>
        ) : null}
      </span>
    </button>
  );
}
