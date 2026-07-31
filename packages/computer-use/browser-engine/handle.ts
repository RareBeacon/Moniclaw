import type { BrowserContext, Page } from "playwright-core";
import { CueError } from "../errors";

/**
 * Live page-set — the tab registry for one session's browser context.
 *
 * Actions only ever see `SessionPageHandle` (interface); the concrete
 * LivePageSet wires dialog auto-handling, popup capture and tab bookkeeping.
 * Session lifecycle/persistence lives in sessions/manager.ts.
 */
export interface TabInfo {
  index: number;
  url: string | null;
  title: string | null;
  active: boolean;
}

export interface SessionPageHandle {
  context(): BrowserContext;
  /** Active page — throws session_closed when nothing is live. */
  page(): Page;
  pages(): readonly Page[];
  activeIndex(): number;
  setActive(index: number): Page;
  openTab(url?: string): Promise<{ page: Page; index: number }>;
  closeTab(index: number): Promise<{ closedUrl: string | null; active: number }>;
  tabCount(): number;
  tabs(): Promise<TabInfo[]>;
  url(): string | null;
  title(): Promise<string | null>;
  isLive(): boolean;
}

export class LivePageSet implements SessionPageHandle {
  private active = 0;

  constructor(
    private readonly ctx: BrowserContext,
    private readonly dialogPolicy: "dismiss" | "accept" = "dismiss"
  ) {
    this.ctx.on("page", (page) => this.wire(page));
    // Wire pages created before the listener attached (initial context page).
    for (const page of this.ctx.pages()) this.wire(page);
  }

  private wire(page: Page): void {
    page.on("dialog", (dialog) => {
      void (this.dialogPolicy === "accept" ? dialog.accept() : dialog.dismiss()).catch(() => {});
    });
    page.on("close", () => {
      const pages = this.ctx.pages();
      if (this.active >= pages.length) this.active = Math.max(0, pages.length - 1);
    });
  }

  context(): BrowserContext {
    return this.ctx;
  }

  private livePages(): Page[] {
    return this.ctx.pages().filter((p) => !p.isClosed());
  }

  page(): Page {
    const pages = this.livePages();
    if (pages.length === 0) throw new CueError("session_closed", "All tabs in this session are closed.");
    const page = pages[Math.min(this.active, pages.length - 1)];
    return page;
  }

  pages(): readonly Page[] {
    return this.livePages();
  }

  activeIndex(): number {
    return this.active;
  }

  setActive(index: number): Page {
    const pages = this.livePages();
    const page = pages[index];
    if (!page) throw new CueError("validation", `Tab index ${index} out of range (${pages.length} open).`);
    this.active = index;
    return page;
  }

  async openTab(url?: string): Promise<{ page: Page; index: number }> {
    const page = await this.ctx.newPage();
    if (url) await page.goto(url, { waitUntil: "domcontentloaded" });
    this.active = this.livePages().indexOf(page);
    return { page, index: this.active };
  }

  async closeTab(index: number): Promise<{ closedUrl: string | null; active: number }> {
    const pages = this.livePages();
    const page = pages[index];
    if (!page) throw new CueError("validation", `Tab index ${index} out of range (${pages.length} open).`);
    const closedUrl = page.url() || null;
    await page.close();
    const remaining = this.livePages();
    this.active = Math.max(0, Math.min(this.active, remaining.length - 1));
    return { closedUrl, active: this.active };
  }

  tabCount(): number {
    return this.livePages().length;
  }

  async tabs(): Promise<TabInfo[]> {
    const pages = this.livePages();
    return Promise.all(
      pages.map(async (page, index) => ({
        index,
        url: page.url() || null,
        title: await page.title().catch(() => null),
        active: index === this.active,
      }))
    );
  }

  url(): string | null {
    try {
      return this.page().url() || null;
    } catch {
      return null;
    }
  }

  async title(): Promise<string | null> {
    try {
      return await this.page().title();
    } catch {
      return null;
    }
  }

  isLive(): boolean {
    return this.ctx.pages().some((p) => !p.isClosed());
  }
}
