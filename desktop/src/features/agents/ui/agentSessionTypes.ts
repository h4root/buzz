import type { LucideIcon } from "lucide-react";

export type ObserverEvent = {
  seq: number;
  timestamp: string;
  kind: string;
  agentIndex: number | null;
  channelId: string | null;
  sessionId: string | null;
  turnId: string | null;
  payload: unknown;
};

export type ConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type ToolStatus = "executing" | "completed" | "failed" | "pending";

/** Observer/ACP wire label for dev-only transcript debugging. */
export type TranscriptAcpSource = string;

export type TranscriptItem =
  | {
      id: string;
      type: "message";
      role: "assistant" | "user";
      title: string;
      text: string;
      timestamp: string;
      acpSource?: TranscriptAcpSource;
      authorPubkey?: string | null;
      channelId?: string | null;
    }
  | {
      id: string;
      type: "thought";
      title: string;
      text: string;
      timestamp: string;
      acpSource?: TranscriptAcpSource;
      channelId?: string | null;
    }
  | {
      id: string;
      type: "lifecycle";
      title: string;
      text: string;
      timestamp: string;
      acpSource?: TranscriptAcpSource;
      channelId?: string | null;
    }
  | {
      id: string;
      type: "metadata";
      title: string;
      sections: PromptSection[];
      timestamp: string;
      acpSource?: TranscriptAcpSource;
      channelId?: string | null;
    }
  | {
      id: string;
      type: "tool";
      title: string;
      toolName: string;
      buzzToolName: string | null;
      status: ToolStatus;
      args: Record<string, unknown>;
      result: string;
      isError: boolean;
      timestamp: string;
      startedAt: string;
      completedAt: string | null;
      acpSource?: TranscriptAcpSource;
      channelId?: string | null;
    };

export type PromptSection = {
  title: string;
  body: string;
};

export type BuzzToolInfo = {
  icon: LucideIcon;
  label: string;
  tone: "read" | "write" | "admin";
};
