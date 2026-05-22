import type * as React from "react";
import { FileText, Hash, UserRound, type LucideIcon } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import {
  resolveUserLabel,
  resolveUserSecondaryLabel,
  truncatePubkey,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import type { Channel, SearchHit, UserSearchResult } from "@/shared/api/types";

export type SearchResult =
  | { kind: "channel"; channel: Channel }
  | { kind: "message"; hit: SearchHit }
  | { kind: "user"; user: UserSearchResult };

const INLINE_MARKDOWN_COMPONENTS: Components = {
  a: ({ children }) => <span>{children}</span>,
  blockquote: ({ children }) => <span>{children}</span>,
  br: () => " ",
  code: ({ children }) => <span>{children}</span>,
  em: ({ children }) => <em>{children}</em>,
  h1: ({ children }) => <span>{children}</span>,
  h2: ({ children }) => <span>{children}</span>,
  h3: ({ children }) => <span>{children}</span>,
  h4: ({ children }) => <span>{children}</span>,
  h5: ({ children }) => <span>{children}</span>,
  h6: ({ children }) => <span>{children}</span>,
  hr: () => null,
  img: ({ alt, src }) => <span>{alt || src || "Image"}</span>,
  li: ({ children }) => <span>{children} </span>,
  ol: ({ children }) => <span>{children}</span>,
  p: ({ children }) => <span>{children}</span>,
  pre: ({ children }) => <span>{children}</span>,
  strong: ({ children }) => <strong>{children}</strong>,
  table: ({ children }) => <span>{children}</span>,
  tbody: ({ children }) => <span>{children}</span>,
  td: ({ children }) => <span>{children} </span>,
  th: ({ children }) => <span>{children} </span>,
  thead: ({ children }) => <span>{children}</span>,
  tr: ({ children }) => <span>{children} </span>,
  ul: ({ children }) => <span>{children}</span>,
};

function InlineMarkdownSnippet({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={INLINE_MARKDOWN_COMPONENTS}
      remarkPlugins={[remarkGfm, remarkBreaks]}
    >
      {content}
    </ReactMarkdown>
  );
}

export function resultKey(result: SearchResult) {
  if (result.kind === "channel") {
    return `channel-${result.channel.id}`;
  }

  if (result.kind === "user") {
    return `user-${result.user.pubkey}`;
  }

  return `message-${result.hit.eventId}`;
}

export function resultTestId(result: SearchResult) {
  if (result.kind === "channel") {
    return `search-result-channel-${result.channel.id}`;
  }

  if (result.kind === "user") {
    return `search-result-user-${result.user.pubkey}`;
  }

  return `search-result-${result.hit.eventId}`;
}

export function resultIcon(
  result: SearchResult,
  channelLookup: ReadonlyMap<string, Channel>,
) {
  if (result.kind === "user") {
    return UserRound;
  }

  const channelType =
    result.kind === "channel"
      ? result.channel.channelType
      : result.hit.channelId
        ? channelLookup.get(result.hit.channelId)?.channelType
        : undefined;

  return channelType === "forum" ? FileText : Hash;
}

export function SearchResultShell({
  children,
  icon: Icon,
  isSelected,
  leading,
  onClick,
  onMouseEnter,
  testId,
}: {
  children: React.ReactNode;
  icon: LucideIcon;
  isSelected: boolean;
  leading?: React.ReactNode;
  onClick: () => void;
  onMouseEnter: () => void;
  testId: string;
}) {
  return (
    <button
      className={
        isSelected
          ? "w-full rounded-lg bg-primary/10 px-2.5 py-2 text-left outline-none transition-colors"
          : "w-full rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent"
      }
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      type="button"
    >
      <div className="flex items-center gap-2.5">
        {leading ?? (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}

        {children}
      </div>
    </button>
  );
}

function formatUserName(user: UserSearchResult) {
  return (
    user.displayName?.trim() ||
    user.nip05Handle?.trim() ||
    truncatePubkey(user.pubkey)
  );
}

function formatUserSecondary(user: UserSearchResult) {
  const displayName = user.displayName?.trim();
  const nip05Handle = user.nip05Handle?.trim();

  if (displayName && nip05Handle) {
    return nip05Handle;
  }

  return truncatePubkey(user.pubkey);
}

export function ChannelResultBody({ channel }: { channel: Channel }) {
  const description = channel.description.trim();

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p
          className="truncate text-sm font-medium tracking-tight"
          title={description || channel.name}
        >
          {channel.name}
        </p>
        <p className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {channel.channelType}
        </p>
      </div>
    </div>
  );
}

export function UserResultBody({ user }: { user: UserSearchResult }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p
          className="truncate text-sm font-medium tracking-tight"
          title={formatUserSecondary(user)}
        >
          {formatUserName(user)}
        </p>
        <p className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          Person
        </p>
      </div>
    </div>
  );
}

export function UserResultAvatar({ user }: { user: UserSearchResult }) {
  const label = formatUserName(user);

  return (
    <ProfileAvatar
      avatarUrl={user.avatarUrl}
      className="h-6 w-6 rounded-md text-[9px] shadow-none"
      iconClassName="h-3.5 w-3.5"
      label={label}
    />
  );
}

function describeSearchHit(hit: SearchHit) {
  switch (hit.kind) {
    case 1:
      return "Note";
    case 45001:
      return "Forum post";
    case 45003:
      return "Forum reply";
    case 43001:
      return "Agent job";
    case 43003:
      return "Agent update";
    case 46010:
      return "Approval request";
    default:
      return "Message";
  }
}

function truncateContent(content: string) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "No message body.";
  }

  if (trimmed.length <= 180) {
    return trimmed;
  }

  return `${trimmed.slice(0, 177)}...`;
}

function formatRelativeTime(unixSeconds: number) {
  const diff = Math.floor(Date.now() / 1_000) - unixSeconds;

  if (diff < 60) {
    return "just now";
  }

  if (diff < 60 * 60) {
    return `${Math.floor(diff / 60)}m ago`;
  }

  if (diff < 60 * 60 * 24) {
    return `${Math.floor(diff / (60 * 60))}h ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1_000));
}

export function MessageResultBody({
  currentPubkey,
  hit,
  resultProfiles,
}: {
  currentPubkey?: string;
  hit: SearchHit;
  resultProfiles?: UserProfileLookup;
}) {
  const authorLabel = resolveUserLabel({
    pubkey: hit.pubkey,
    currentPubkey,
    profiles: resultProfiles,
    preferResolvedSelfLabel: true,
  });
  const authorSecondaryLabel = resolveUserSecondaryLabel({
    pubkey: hit.pubkey,
    profiles: resultProfiles,
  });
  const metadata = [
    hit.channelName,
    authorLabel,
    formatRelativeTime(hit.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
  const title = [metadata, authorSecondaryLabel, hit.content]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p
          className="truncate text-sm font-medium tracking-tight"
          title={title}
        >
          <InlineMarkdownSnippet content={truncateContent(hit.content)} />
        </p>
        <p className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {describeSearchHit(hit)}
        </p>
      </div>
    </div>
  );
}
