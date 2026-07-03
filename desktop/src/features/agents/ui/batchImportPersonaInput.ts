import type { ParsedPersonaPreview } from "@/shared/api/tauriPersonas";
import { importedAvatarUrl } from "./agentDraft";

/** Base fields for a managed agent created from an imported agent file. */
export type BatchImportAgentInput = {
  name: string;
  avatarUrl: string | undefined;
  systemPrompt: string;
  /** Preferred ACP runtime id hint from the file (resolved by the caller). */
  runtime: string | undefined;
  model: string | undefined;
  provider: string | undefined;
};

export function buildBatchImportAgentInput(
  preview: ParsedPersonaPreview,
): BatchImportAgentInput {
  return {
    name: preview.displayName,
    avatarUrl: importedAvatarUrl(preview) || undefined,
    systemPrompt: preview.systemPrompt,
    runtime: preview.runtime ?? undefined,
    model: preview.model ?? undefined,
    provider: preview.provider ?? undefined,
  };
}
