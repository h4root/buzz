import { Bot, Check } from "lucide-react";

import type { ManagedAgent } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { promptPreview } from "@/shared/lib/promptPreview";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

type SelectionChipButtonProps = {
  avatarUrl?: string | null;
  disabled: boolean;
  label: string;
  onClick: () => void;
  selected: boolean;
  children: React.ReactNode;
};

function SelectionChipButton({
  avatarUrl,
  disabled,
  label,
  onClick,
  selected,
  children,
}: SelectionChipButtonProps) {
  const showAvatar = avatarUrl !== undefined;

  return (
    <button
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border py-1.5 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        showAvatar ? "pl-1.5 pr-3" : "px-3",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border/80 bg-background/60 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {showAvatar ? (
        <ProfileAvatar
          avatarUrl={avatarUrl}
          className={cn(
            "h-6 w-6 text-2xs",
            selected
              ? "bg-primary/20 text-primary ring-1 ring-primary/20"
              : "bg-background/80 text-muted-foreground ring-1 ring-border/70",
          )}
          iconClassName="h-4 w-4"
          label={label}
        />
      ) : null}
      {children}
    </button>
  );
}

type AddChannelBotAgentsSectionProps = {
  agents: ManagedAgent[];
  canToggleSelections: boolean;
  inChannelPubkeys?: ReadonlySet<string>;
  includeGeneric: boolean;
  isLoading: boolean;
  onToggleAgent: (pubkey: string) => void;
  onToggleGeneric: () => void;
  selectedAgentPubkeys: readonly string[];
  /** Whether to show the "Generic" chip. Defaults to true. */
  showGeneric?: boolean;
};

export function AddChannelBotAgentsSection({
  agents,
  canToggleSelections,
  inChannelPubkeys,
  includeGeneric,
  isLoading,
  onToggleAgent,
  onToggleGeneric,
  selectedAgentPubkeys,
  showGeneric = true,
}: AddChannelBotAgentsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium">Agents</div>
          <p className="text-xs text-muted-foreground">
            Toggle as many as you want. Each selected agent joins the channel.
            Hover an agent to preview its role.
          </p>
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="flex flex-wrap gap-2">
            {showGeneric ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <SelectionChipButton
                      disabled={!canToggleSelections}
                      label="New agent"
                      onClick={onToggleGeneric}
                      selected={includeGeneric}
                    >
                      <Bot
                        className={cn(
                          "h-4 w-4",
                          includeGeneric ? "text-primary" : "text-current",
                        )}
                      />
                      New agent
                    </SelectionChipButton>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-left">
                  Add one new agent with a channel-specific name and
                  instructions.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {agents.map((agent) => {
              const isSelected = selectedAgentPubkeys.includes(agent.pubkey);
              const isInChannel =
                inChannelPubkeys?.has(normalizePubkey(agent.pubkey)) ?? false;
              return (
                <Tooltip key={agent.pubkey}>
                  <TooltipTrigger asChild>
                    <div>
                      <SelectionChipButton
                        avatarUrl={agent.avatarUrl}
                        disabled={!canToggleSelections || isInChannel}
                        label={agent.name}
                        onClick={() => onToggleAgent(agent.pubkey)}
                        selected={isSelected}
                      >
                        {agent.name}
                        {isInChannel ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium leading-none",
                              isSelected
                                ? "bg-primary/15 text-primary"
                                : "bg-muted/60 text-muted-foreground",
                            )}
                          >
                            <Check className="h-4 w-4" />
                            In channel
                          </span>
                        ) : null}
                      </SelectionChipButton>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-left">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <ProfileAvatar
                          avatarUrl={agent.avatarUrl}
                          className="h-7 w-7 text-2xs bg-primary-foreground/20 text-primary-foreground"
                          iconClassName="h-4 w-4"
                          label={agent.name}
                        />
                        <p className="font-medium">{agent.name}</p>
                      </div>
                      {isInChannel ? (
                        <p className="text-2xs font-medium text-emerald-300">
                          ✓ Already in this channel
                        </p>
                      ) : null}
                      {agent.systemPrompt ? (
                        <p className="text-2xs text-primary-foreground">
                          {promptPreview(agent.systemPrompt)}
                        </p>
                      ) : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading agents...</p>
        ) : null}
      </div>
    </div>
  );
}
