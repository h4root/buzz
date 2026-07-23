import type { QueryClient } from "@tanstack/react-query";

import {
  getAvatarPresentation,
  subscribeAvatarPresentations,
  type AvatarPresentation,
} from "@/features/profile/avatarPresentationStore";
import { refreshProfileCaches } from "@/features/profile/profileCacheSync";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { updateProfileAtRelay } from "@/shared/api/tauriProfiles";
import type { Profile } from "@/shared/api/types";
import { isRelayUnreachableError } from "@/shared/lib/relayError";

const AVATAR_SAVE_RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;

type PendingAvatarSave = {
  avatarUrl: string;
  relayUrl: string;
  expectedPubkey: string;
  expectedAvatarUrl: string | null;
};

type AvatarProfileSyncDependencies = {
  getPresentation: (avatarUrl: string) => AvatarPresentation | null;
  subscribe: (listener: () => void) => () => void;
  saveProfile: (input: PendingAvatarSave) => Promise<Profile>;
  getActivePubkey: () => Promise<string | null>;
  refreshCaches: (profile: Profile, input: PendingAvatarSave) => Promise<void>;
  scheduleRetry?: (callback: () => void, delayMs: number) => () => void;
};

function isRetryableAvatarSaveError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    isRelayUnreachableError(error) || message.startsWith("relay rate-limited:")
  );
}

export function createAvatarProfileSync(
  dependencies: AvatarProfileSyncDependencies,
) {
  const pendingSyncs = new Map<string, () => void>();
  let generation = 0;

  const reset = () => {
    generation += 1;
    for (const stop of pendingSyncs.values()) stop();
    pendingSyncs.clear();
  };

  const saveWhenReady = (input: PendingAvatarSave): void => {
    const syncKey = `${input.relayUrl}:${input.expectedPubkey}:${input.avatarUrl}`;
    if (pendingSyncs.has(syncKey)) return;

    let isSaving = false;
    let retryAttempt = 0;
    let cancelRetry: (() => void) | null = null;
    let unsubscribe = () => {};
    const queuedGeneration = generation;
    const stop = () => {
      cancelRetry?.();
      cancelRetry = null;
      unsubscribe();
      pendingSyncs.delete(syncKey);
    };
    const saveIfReady = () => {
      if (generation !== queuedGeneration) return;
      const presentation = dependencies.getPresentation(input.avatarUrl);
      if (!presentation) {
        stop();
        return;
      }
      if (presentation.state !== "ready" || isSaving) return;

      isSaving = true;
      void dependencies
        .saveProfile(input)
        .then(async (profile) => {
          if (generation !== queuedGeneration) return;
          const activePubkey = await dependencies.getActivePubkey();
          if (
            generation !== queuedGeneration ||
            activePubkey?.toLowerCase() !== input.expectedPubkey.toLowerCase()
          ) {
            return;
          }
          await dependencies.refreshCaches(profile, input);
        })
        .then(stop)
        .catch((error: unknown) => {
          if (
            generation !== queuedGeneration ||
            !isRetryableAvatarSaveError(error)
          ) {
            stop();
            return;
          }
          const delayMs = AVATAR_SAVE_RETRY_DELAYS_MS[retryAttempt];
          if (delayMs === undefined) {
            stop();
            return;
          }
          retryAttempt += 1;
          isSaving = false;
          const scheduleRetry =
            dependencies.scheduleRetry ??
            ((callback, delay) => {
              const timeout = window.setTimeout(callback, delay);
              return () => window.clearTimeout(timeout);
            });
          cancelRetry = scheduleRetry(() => {
            cancelRetry = null;
            saveIfReady();
          }, delayMs);
        });
    };

    unsubscribe = dependencies.subscribe(saveIfReady);
    pendingSyncs.set(syncKey, stop);
    saveIfReady();
  };

  return { reset, saveWhenReady };
}

let queryClient: QueryClient | null = null;

export function setAvatarProfileSyncQueryClient(
  client: QueryClient | null,
): void {
  queryClient = client;
}

const avatarProfileSync = createAvatarProfileSync({
  getPresentation: getAvatarPresentation,
  subscribe: subscribeAvatarPresentations,
  saveProfile: updateProfileAtRelay,
  getActivePubkey: async () => {
    try {
      return (await getIdentity()).pubkey;
    } catch {
      return null;
    }
  },
  refreshCaches: async (profile, input) => {
    if (!queryClient) return;
    await refreshProfileCaches(queryClient, profile, input.relayUrl);
  },
});

export function saveAvatarWhenReady(input: PendingAvatarSave): void {
  avatarProfileSync.saveWhenReady(input);
}

export function resetAvatarProfileSync(): void {
  avatarProfileSync.reset();
}
