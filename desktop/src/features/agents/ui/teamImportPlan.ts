import type { ParsedTeamPreview } from "@/shared/api/tauriTeams";
import type { AgentPersona, AgentTeam, ManagedAgent } from "@/shared/api/types";

type ImportedTeamPersona = ParsedTeamPreview["personas"][number];

/** A team member resolved from either an agent record or a pack persona. */
export type ExistingTeamMember = {
  kind: "agent" | "persona";
  /** Agent pubkey or persona id. */
  id: string;
  displayName: string;
  avatarUrl: string | null;
  systemPrompt: string;
};

type LineChangeCounts = {
  addedLines: number;
  removedLines: number;
};

export type TeamImportMatchedMember = {
  existing: ExistingTeamMember;
  imported: ImportedTeamPersona;
  importedIndex: number;
  hasChanges: boolean;
  addedLines: number;
  removedLines: number;
};

export type TeamImportNewMember = {
  imported: ImportedTeamPersona;
  importedIndex: number;
  addedLines: number;
};

export type TeamImportMissingMember = {
  existing: ExistingTeamMember;
  removedLines: number;
};

export type TeamImportPlan = {
  matchedMembers: TeamImportMatchedMember[];
  membersToUpdate: TeamImportMatchedMember[];
  newMembers: TeamImportNewMember[];
  missingMembers: TeamImportMissingMember[];
  unresolvedMemberIds: string[];
  teamNameChanged: boolean;
  teamDescriptionChanged: boolean;
};

type BuildTeamImportPlanInput = {
  team: AgentTeam;
  personas: AgentPersona[];
  agents: ManagedAgent[];
  preview: ParsedTeamPreview;
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeOptionalText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeAvatar(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value);
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePromptLines(prompt: string): string[] {
  const normalized = prompt.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function existingMemberSnapshotLines(member: ExistingTeamMember): string[] {
  return [
    `display_name:${normalizeOptionalText(member.displayName)}`,
    `avatar_url:${normalizeAvatar(member.avatarUrl) ?? ""}`,
    ...normalizePromptLines(member.systemPrompt).map(
      (line) => `prompt:${line}`,
    ),
  ];
}

function importedPersonaSnapshotLines(persona: ImportedTeamPersona): string[] {
  return [
    `display_name:${normalizeOptionalText(persona.display_name)}`,
    `avatar_url:${normalizeAvatar(persona.avatar_url) ?? ""}`,
    ...normalizePromptLines(persona.system_prompt).map(
      (line) => `prompt:${line}`,
    ),
  ];
}

function countLineChanges(
  previousLines: string[],
  nextLines: string[],
): LineChangeCounts {
  const previousLength = previousLines.length;
  const nextLength = nextLines.length;

  if (previousLength === 0) {
    return {
      addedLines: nextLength,
      removedLines: 0,
    };
  }

  if (nextLength === 0) {
    return {
      addedLines: 0,
      removedLines: previousLength,
    };
  }

  const lcs = Array.from({ length: previousLength + 1 }, () =>
    Array<number>(nextLength + 1).fill(0),
  );

  for (let i = previousLength - 1; i >= 0; i -= 1) {
    for (let j = nextLength - 1; j >= 0; j -= 1) {
      if (previousLines[i] === nextLines[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  let i = 0;
  let j = 0;
  let addedLines = 0;
  let removedLines = 0;

  while (i < previousLength && j < nextLength) {
    if (previousLines[i] === nextLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      removedLines += 1;
      i += 1;
    } else {
      addedLines += 1;
      j += 1;
    }
  }

  removedLines += previousLength - i;
  addedLines += nextLength - j;

  return {
    addedLines,
    removedLines,
  };
}

function getMemberLineChangeCounts(
  existing: ExistingTeamMember,
  imported: ImportedTeamPersona,
): LineChangeCounts {
  return countLineChanges(
    existingMemberSnapshotLines(existing),
    importedPersonaSnapshotLines(imported),
  );
}

function getImportedPersonaLineCount(persona: ImportedTeamPersona): number {
  return importedPersonaSnapshotLines(persona).length;
}

function getExistingMemberLineCount(member: ExistingTeamMember): number {
  return existingMemberSnapshotLines(member).length;
}

export function buildTeamImportPlan({
  team,
  personas,
  agents,
  preview,
}: BuildTeamImportPlanInput): TeamImportPlan {
  const personaById = new Map(personas.map((persona) => [persona.id, persona]));
  const agentByPubkey = new Map(agents.map((agent) => [agent.pubkey, agent]));
  const matchedImportedIndexes = new Set<number>();
  const matchedMembers: TeamImportMatchedMember[] = [];
  const missingMembers: { existing: ExistingTeamMember }[] = [];
  const unresolvedMemberIds: string[] = [];

  const existingMembers: ExistingTeamMember[] = [];
  for (const personaId of team.personaIds) {
    const persona = personaById.get(personaId);
    if (!persona) {
      unresolvedMemberIds.push(personaId);
      continue;
    }
    existingMembers.push({
      kind: "persona",
      id: persona.id,
      displayName: persona.displayName,
      avatarUrl: persona.avatarUrl,
      systemPrompt: persona.systemPrompt,
    });
  }
  for (const pubkey of team.agentPubkeys) {
    const agent = agentByPubkey.get(pubkey);
    if (!agent) {
      unresolvedMemberIds.push(pubkey);
      continue;
    }
    existingMembers.push({
      kind: "agent",
      id: agent.pubkey,
      displayName: agent.name,
      avatarUrl: agent.avatarUrl,
      systemPrompt: agent.systemPrompt ?? "",
    });
  }

  for (const existing of existingMembers) {
    const existingName = normalizeName(existing.displayName);
    const importedIndex = preview.personas.findIndex(
      (imported, index) =>
        !matchedImportedIndexes.has(index) &&
        normalizeName(imported.display_name) === existingName,
    );

    if (importedIndex === -1) {
      missingMembers.push({ existing });
      continue;
    }

    matchedImportedIndexes.add(importedIndex);
    const imported = preview.personas[importedIndex];
    const { addedLines, removedLines } = getMemberLineChangeCounts(
      existing,
      imported,
    );
    matchedMembers.push({
      existing,
      imported,
      importedIndex,
      hasChanges: addedLines > 0 || removedLines > 0,
      addedLines,
      removedLines,
    });
  }

  const newMembers: TeamImportNewMember[] = [];
  preview.personas.forEach((imported, index) => {
    if (!matchedImportedIndexes.has(index)) {
      newMembers.push({
        imported,
        importedIndex: index,
        addedLines: getImportedPersonaLineCount(imported),
      });
    }
  });

  const membersToUpdate = matchedMembers.filter((member) => member.hasChanges);

  return {
    matchedMembers,
    membersToUpdate,
    newMembers,
    missingMembers: missingMembers.map((member) => ({
      ...member,
      removedLines: getExistingMemberLineCount(member.existing),
    })),
    unresolvedMemberIds,
    teamNameChanged: normalizeOptionalText(team.name) !== preview.name,
    teamDescriptionChanged:
      normalizeOptionalText(team.description) !==
      normalizeOptionalText(preview.description),
  };
}
