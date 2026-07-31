import type { ProfileRepository } from "../ports";
import type { StorageState } from "../types";

/**
 * ProfileService — CRUD for reusable browser profiles.
 *
 * Storage state (cookies + web storage) is encrypted at rest — the cipher
 * boundary lives inside the ProfileRepository implementation (the prisma
 * repo is constructed with the app AES-256-GCM vault); this service deals
 * only in plaintext StorageState objects and never touches key material.
 */
export class ProfileService {
  constructor(private readonly profiles: ProfileRepository) {}

  create(row: Parameters<ProfileRepository["create"]>[0]) {
    return this.profiles.create(row);
  }

  list(workspaceId: string) {
    return this.profiles.list(workspaceId);
  }

  get(id: string, workspaceId: string) {
    return this.profiles.get(id, workspaceId);
  }

  update(id: string, patch: Parameters<ProfileRepository["update"]>[1]) {
    return this.profiles.update(id, patch);
  }

  async softDelete(id: string, workspaceId: string) {
    const deleted = await this.profiles.softDelete(id, workspaceId);
    if (deleted) await this.profiles.clearStorageState(id).catch(() => {});
    return deleted;
  }

  /** Decrypted storage state for session creation (null when unset). */
  readStorageState(id: string): Promise<StorageState | null> {
    return this.profiles.readStorageState(id);
  }

  /** Persist a live context's storage state into the profile. */
  writeStorageState(id: string, state: StorageState): Promise<void> {
    return this.profiles.writeStorageState(id, state);
  }

  clearStorageState(id: string): Promise<void> {
    return this.profiles.clearStorageState(id);
  }
}
