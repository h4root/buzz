import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { getProjectRepoSnapshot } from "@/shared/api/projectGit";
import type { ProjectRepoSnapshot } from "@/shared/api/types";
import type { Project } from "./hooks";

// Repo snapshots are backed by a blobless `git clone` per repository, so the
// overview scan is deliberately throttled and cached for a long time.
const OVERVIEW_SNAPSHOT_CONCURRENCY = 3;

async function fetchProjectsRepoSnapshots(
  projects: Project[],
): Promise<Record<string, ProjectRepoSnapshot>> {
  const snapshots: Record<string, ProjectRepoSnapshot> = {};
  const queue = [...projects];

  const workers = Array.from(
    { length: Math.min(OVERVIEW_SNAPSHOT_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const project = queue.shift();
        if (!project) return;
        const cloneUrl = project.cloneUrls[0];
        if (!cloneUrl) continue;
        try {
          snapshots[project.id] = await getProjectRepoSnapshot({
            cloneUrl,
            defaultBranch: project.defaultBranch,
            baseBranch: project.defaultBranch,
          });
        } catch {
          // Best-effort: unreachable or empty repositories are skipped.
        }
      }
    },
  );

  await Promise.all(workers);
  return snapshots;
}

/**
 * Fetches repo snapshots for a set of projects (throttled, failure-tolerant)
 * for workspace-wide aggregates like the overview language breakdown.
 * Callers should pre-filter and cap `projects` — one git clone per entry.
 */
export function useProjectsRepoSnapshotsQuery(projects: Project[]) {
  const projectIds = React.useMemo(
    () => projects.map((project) => project.id).sort(),
    [projects],
  );

  return useQuery({
    enabled: projects.length > 0,
    queryKey: ["projects", "repo-snapshots", projectIds],
    queryFn: () => fetchProjectsRepoSnapshots(projects),
    staleTime: 15 * 60_000,
    retry: 0,
  });
}
