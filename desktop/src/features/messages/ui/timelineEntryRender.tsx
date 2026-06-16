import type * as React from "react";

import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { buildVideoReviewContextForMessage } from "@/features/messages/lib/videoReviewContext";
import type { TimelineMessage } from "@/features/messages/types";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { ChannelType } from "@/shared/api/types";
import { KIND_SYSTEM_MESSAGE } from "@/shared/constants/kinds";
import { cn } from "@/shared/lib/cn";
import { MessageRow } from "./MessageRow";
import { MessageThreadSummaryRow } from "./MessageThreadSummaryRow";
import { SystemMessageRow } from "./SystemMessageRow";

type VideoReviewContext = NonNullable<
  ReturnType<typeof buildVideoReviewContextForMessage>
>;

/**
 * Everything a single timeline entry needs to render itself, independent of how
 * the surrounding list is laid out. Both the nested day-grouped list
 * (`TimelineMessageList`) and the flat virtualized list
 * (`VirtualizedTimelineList`) build this once and reuse `renderTimelineEntry`,
 * so the three row variants (system / thread-summary / plain) and their
 * highlight + search styling stay a single source of truth.
 */
export type TimelineEntryRenderContext = {
  agentPubkeys?: ReadonlySet<string>;
  channelId?: string | null;
  currentPubkey?: string;
  followThreadById?: (rootId: string) => void;
  highlightedMessageId?: string | null;
  isFollowingThreadById?: (rootId: string) => boolean;
  messageFooters?: Record<string, React.ReactNode>;
  onDelete?: (message: TimelineMessage) => void;
  onEdit?: (message: TimelineMessage) => void;
  onMarkUnread?: (message: TimelineMessage) => void;
  onReply?: (message: TimelineMessage) => void;
  personaLookup?: Map<string, string>;
  onToggleReaction?: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  profiles?: UserProfileLookup;
  searchActiveMessageId?: string | null;
  searchMatchingMessageIds?: Set<string>;
  searchQuery?: string;
  unfollowThreadById?: (rootId: string) => void;
  videoReviewContextById: Map<string, VideoReviewContext>;
  /** Present only when the list passes `channelType` through to video review. */
  channelType?: ChannelType | null;
};

/**
 * Render the row content for one main-timeline entry. Returns the inner element
 * (no day-group wrapper) so callers control list layout — nested `<section>`s in
 * the classic list, absolutely-positioned virtual rows in the virtualized list.
 */
export function renderTimelineEntry(
  entry: MainTimelineEntry,
  ctx: TimelineEntryRenderContext,
): React.ReactNode {
  const { message, summary } = entry;
  const footer = ctx.messageFooters?.[message.id] ?? null;

  if (message.kind === KIND_SYSTEM_MESSAGE) {
    return (
      <div className="flex flex-col gap-1">
        <SystemMessageRow
          message={message}
          agentPubkeys={ctx.agentPubkeys}
          currentPubkey={ctx.currentPubkey}
          onToggleReaction={ctx.onToggleReaction}
          personaLookup={ctx.personaLookup}
          profiles={ctx.profiles}
        />
        {footer}
      </div>
    );
  }

  if (summary && ctx.onReply) {
    const isHighlighted = message.id === ctx.highlightedMessageId;
    return (
      <div
        className={cn(
          "group/message relative -mx-1 flex flex-col gap-0 rounded-2xl px-1 py-1 transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
          isHighlighted &&
            "-mx-4 px-4 before:absolute before:-inset-y-1.5 before:inset-x-0 before:animate-[route-target-highlight-fade_2s_ease-out_forwards] before:bg-primary/10 before:content-[''] motion-reduce:before:animate-none sm:-mx-6 sm:px-6",
        )}
      >
        <MessageRow
          agentPubkeys={ctx.agentPubkeys}
          channelId={ctx.channelId}
          highlighted={false}
          hoverBackground={false}
          isFollowingThread={
            ctx.isFollowingThreadById
              ? ctx.isFollowingThreadById(message.id)
              : undefined
          }
          message={message}
          onDelete={
            ctx.onDelete &&
            ctx.currentPubkey &&
            message.pubkey === ctx.currentPubkey
              ? ctx.onDelete
              : undefined
          }
          onEdit={
            ctx.onEdit &&
            ctx.currentPubkey &&
            message.pubkey === ctx.currentPubkey
              ? ctx.onEdit
              : undefined
          }
          onFollowThread={
            ctx.followThreadById
              ? () => ctx.followThreadById?.(message.id)
              : undefined
          }
          onMarkUnread={ctx.onMarkUnread}
          onToggleReaction={ctx.onToggleReaction}
          onReply={ctx.onReply}
          onUnfollowThread={
            ctx.unfollowThreadById
              ? () => ctx.unfollowThreadById?.(message.id)
              : undefined
          }
          profiles={ctx.profiles}
          showDepthGuides={false}
          videoReviewContext={ctx.videoReviewContextById.get(message.id)}
        />
        <MessageThreadSummaryRow
          depth={message.depth}
          message={message}
          onOpenThread={ctx.onReply}
          showDepthGuides={false}
          summary={summary}
        />
        {footer}
      </div>
    );
  }

  const isSearchMatch = ctx.searchMatchingMessageIds?.has(message.id) ?? false;
  const isSearchActive = message.id === ctx.searchActiveMessageId;
  return (
    <div className="flex flex-col gap-1">
      <MessageRow
        agentPubkeys={ctx.agentPubkeys}
        channelId={ctx.channelId}
        highlighted={message.id === ctx.highlightedMessageId || isSearchActive}
        message={message}
        onDelete={
          ctx.onDelete &&
          ctx.currentPubkey &&
          message.pubkey === ctx.currentPubkey
            ? ctx.onDelete
            : undefined
        }
        onEdit={
          ctx.onEdit &&
          ctx.currentPubkey &&
          message.pubkey === ctx.currentPubkey
            ? ctx.onEdit
            : undefined
        }
        onMarkUnread={ctx.onMarkUnread}
        onToggleReaction={ctx.onToggleReaction}
        onReply={ctx.onReply}
        profiles={ctx.profiles}
        searchQuery={isSearchMatch ? ctx.searchQuery : undefined}
        showDepthGuides={false}
        videoReviewContext={ctx.videoReviewContextById.get(message.id)}
      />
      {footer}
    </div>
  );
}
