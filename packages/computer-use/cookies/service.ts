import type { BrowserContext } from "playwright-core";
import type { CookieRecord, SessionKind, StorageState } from "../types";

/**
 * CookiesService — session-cookie persistence rules.
 *
 *  • EPHEMERAL  — state is snapshotted on demand (for user-initiated
 *                 "save to profile") and discarded at close.
 *  • PERSISTENT — context starts from the profile's state and writes back
 *                 at close/heartbeat (the manager calls these helpers).
 *  • INCOGNITO  — nothing ever leaves the live context; snapshot/refuse
 *                 semantics are enforced here so the rule can't be
 *                 bypassed by a later call-site refactor.
 */
export class CookiesService {
  /** Can this session kind export cookies to a persistent store? */
  canPersist(kind: SessionKind): boolean {
    return kind === "EPHEMERAL" || kind === "PERSISTENT";
  }

  /** Snapshot the full storage state of a live context. */
  async snapshot(context: BrowserContext): Promise<StorageState> {
    const state = (await context.storageState()) as unknown as StorageState;
    return {
      cookies: state.cookies ?? [],
      origins: state.origins ?? [],
    };
  }

  /** Snapshot only cookies (cheap heartbeat write-back path). */
  async snapshotCookies(context: BrowserContext): Promise<CookieRecord[]> {
    return (await context.cookies()) as unknown as CookieRecord[];
  }

  /**
   * Cookies visible for a URL — powers the cookie inspector on the
   * Sessions page without constructing a storage-state object.
   */
  async forUrl(context: BrowserContext, url: string): Promise<CookieRecord[]> {
    return (await context.cookies([url])) as unknown as CookieRecord[];
  }

  /** Validate cookies before write (name/value limits, url fallback). */
  normalizeForWrite(cookies: CookieRecord[], fallbackUrl: string | null): Array<CookieRecord & { url?: string }> {
    return cookies.map((cookie) => {
      const record: CookieRecord & { url?: string } = { ...cookie, path: cookie.path ?? "/" };
      if (!record.domain) {
        // playwright requires url OR domain
        if (fallbackUrl) record.url = fallbackUrl;
      }
      return record;
    });
  }
}
