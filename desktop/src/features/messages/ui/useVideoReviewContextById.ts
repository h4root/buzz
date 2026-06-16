import * as React from "react";

import {
  buildVideoReviewCommentsByRootId,
  buildVideoReviewContextForMessage,
} from "@/features/messages/lib/videoReviewContext";
import type { TimelineMessage } from "@/features/messages/types";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { ChannelType } from "@/shared/api/types";

type VideoReviewContext = NonNullable<
  ReturnType<typeof buildVideoReviewContextForMessage>
>;

type UseVideoReviewContextByIdOptions = {
  channelId?: string | null;
  channelName?: string;
  channelType?: ChannelType | null;
  isSendingVideoReviewComment?: boolean;
  messages: TimelineMessage[];
  onSendVideoReviewComment?: (
    message: TimelineMessage,
    content: string,
    mentionPubkeys: string[],
    mediaTags?: string[][],
    parentEventId?: string,
  ) => Promise<void>;
  onToggleReaction?: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  profiles?: UserProfileLookup;
};

/**
 * Build the per-message video-review context map, memoized by message id so
 * MessageRow/Markdown memo comparisons hold across unrelated timeline
 * re-renders (typing indicators, presence). A fresh context object per render
 * would defeat the memo and re-render every video message on every pass.
 *
 * Extracted so the classic nested list and the virtualized list build it
 * identically — one source of truth for the video-review wiring.
 */
export function useVideoReviewContextById({
  channelId,
  channelName,
  channelType,
  isSendingVideoReviewComment = false,
  messages,
  onSendVideoReviewComment,
  onToggleReaction,
  profiles,
}: UseVideoReviewContextByIdOptions): Map<string, VideoReviewContext> {
  const reviewCommentsByRootId = React.useMemo(
    () => buildVideoReviewCommentsByRootId(messages),
    [messages],
  );

  return React.useMemo(() => {
    const contexts = new Map<string, VideoReviewContext>();
    for (const message of messages) {
      const comments = reviewCommentsByRootId.get(message.id) ?? [];
      const context = buildVideoReviewContextForMessage({
        channelId,
        channelName,
        channelType,
        comments,
        isSendingVideoReviewComment,
        message,
        onSendVideoReviewComment,
        onToggleReaction,
        profiles,
      });
      if (context) {
        contexts.set(message.id, context);
      }
    }
    return contexts;
  }, [
    channelId,
    channelName,
    channelType,
    isSendingVideoReviewComment,
    messages,
    onSendVideoReviewComment,
    onToggleReaction,
    profiles,
    reviewCommentsByRootId,
  ]);
}
