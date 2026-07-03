import {
  fromRawManagedAgent,
  invokeTauri,
  type RawManagedAgent,
} from "@/shared/api/tauri";
import type { AgentTemplate, ManagedAgent } from "@/shared/api/types";

export async function setManagedAgentStartOnAppLaunch(
  pubkey: string,
  startOnAppLaunch: boolean,
): Promise<ManagedAgent> {
  const response = await invokeTauri<RawManagedAgent>(
    "set_managed_agent_start_on_app_launch",
    {
      pubkey,
      startOnAppLaunch,
    },
  );
  return fromRawManagedAgent(response);
}

/** Built-in starter templates for the Create Agent wizard (static data). */
export async function listAgentTemplates(): Promise<AgentTemplate[]> {
  return invokeTauri<AgentTemplate[]>("list_agent_templates");
}

/**
 * Export a managed agent's pinned config as a shareable `.persona.json` card.
 * Returns `false` when the user cancels the save dialog.
 */
export async function exportAgentToJson(pubkey: string): Promise<boolean> {
  return invokeTauri<boolean>("export_agent_to_json", { pubkey });
}
