import { z } from "zod";
import type { ExecutionRow, SessionRow } from "../ports";

/**
 * browser-tools — turns the engine into a Tool Provider for the AI Runtime.
 *
 * The provider is deliberately decoupled: it speaks to a `BrowserGateway`
 * (the narrow engine surface AI workers may touch) and returns tool-shaped
 * objects that structurally satisfy the AI runtime's `Tool` interface
 * (packages/ai-runtime/tools/tool.ts). The app layer registers them — the
 * engine never imports the AI runtime, and the AI runtime never imports
 * playwright.
 */

/** The narrow engine surface exposed to the AI runtime as tools. */
export interface BrowserGateway {
  createSession(input: {
    workspaceId: string; userId?: string | null; profileId?: string | null;
    kind?: "EPHEMERAL" | "PERSISTENT" | "INCOGNITO"; startUrl?: string;
  }): Promise<SessionRow>;
  closeSession(sessionId: string, workspaceId: string, userId?: string | null): Promise<void>;
  getSession(sessionId: string, workspaceId: string): Promise<SessionRow | null>;
  runExecution(input: {
    workspaceId: string; userId?: string | null; sessionId: string; goal?: string;
    steps: Array<{ action: string; args: Record<string, unknown> }>;
    /** When true the call awaits completion (bounded) and returns the final row. */
    inline?: boolean;
  }): Promise<ExecutionRow>;
  tabList(sessionId: string, workspaceId: string): Promise<Array<{ index: number; url: string | null; title: string | null; active: boolean }> | null>;
}

export interface ToolShape<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly name: string;
  readonly description: string;
  readonly schema: TSchema;
  readonly metadata: {
    category: string;
    mutating: boolean;
    requiredAction?: string;
    defaultTimeoutMs?: number;
    version: string;
  };
  execute(input: z.infer<TSchema>, ctx: { workspaceId: string; userId?: string | null }): Promise<unknown>;
}

/** Keeps each tool literal's execute() typed with ITS schema's input. */
function tool<TSchema extends z.ZodTypeAny>(definition: ToolShape<TSchema>): ToolShape<TSchema> {
  return definition;
}

const VERSION = "4.0.0";
const selectorDoc = `Unified selector: {strategy:"css"|"xpath"|"text"|"role"|"aria"|"label"|"placeholder"|"testid", ...} or {primary, fallbacks[]}.`;

const stepsSchema = z.array(z.object({
  action: z.string().describe("Action id from the browser action catalog (e.g. navigate, click, type, extract_text, take_screenshot)."),
  args: z.record(z.string(), z.unknown()).default({}).describe(`Action args. Selector-carrying actions take "selector": ${selectorDoc}`),
})).min(1).max(50);

/** Build the complete browser tool set bound to a gateway. */
export function browserToolProvider(gateway: BrowserGateway): ToolShape[] {
  return [
    tool({
      name: "browser_session_create",
      description: "Open an isolated browser session (workspace-scoped, policy-enforced). Returns a sessionId for subsequent browser tools. Optionally attach a persistent profile (cookies/storage persist) or go incognito.",
      schema: z.object({
        startUrl: z.string().url().optional().describe("Optional URL to open immediately (domain policy applies)."),
        profileId: z.string().uuid().optional().describe("BrowserProfile id — makes the session PERSISTENT."),
        incognito: z.boolean().default(false).describe("Isolated context, nothing persists."),
      }),
      metadata: { category: "browser", mutating: true, requiredAction: "browser.execute", defaultTimeoutMs: 45_000, version: VERSION },
      async execute(input, ctx) {
        const row = await gateway.createSession({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId ?? null,
          profileId: input.profileId ?? null,
          kind: input.incognito ? "INCOGNITO" : input.profileId ? "PERSISTENT" : "EPHEMERAL",
          ...(input.startUrl ? { startUrl: input.startUrl } : {}),
        });
        return { sessionId: row.id, browser: row.browser, mode: row.mode, kind: row.kind, status: row.status, endpoint: row.endpoint };
      },
    }),
    tool({
      name: "browser_session_close",
      description: "Close a browser session and release its resources (persistent profiles keep their cookies/storage).",
      schema: z.object({ sessionId: z.string().uuid() }),
      metadata: { category: "browser", mutating: true, requiredAction: "browser.execute", defaultTimeoutMs: 15_000, version: VERSION },
      async execute(input, ctx) {
        await gateway.closeSession(input.sessionId, ctx.workspaceId, ctx.userId ?? null);
        return { closed: true, sessionId: input.sessionId };
      },
    }),
    tool({
      name: "browser_session_status",
      description: "Read a browser session's status, current URL/title and open tabs.",
      schema: z.object({ sessionId: z.string().uuid() }),
      metadata: { category: "browser", mutating: false, requiredAction: "browser.read", defaultTimeoutMs: 10_000, version: VERSION },
      async execute(input, ctx) {
        const row = await gateway.getSession(input.sessionId, ctx.workspaceId);
        if (!row) return { found: false, sessionId: input.sessionId };
        const tabs = await gateway.tabList(input.sessionId, ctx.workspaceId);
        return {
          found: true, sessionId: row.id, status: row.status, browser: row.browser,
          url: row.currentUrl, title: row.currentTitle, tabCount: row.tabCount, tabs,
        };
      },
    }),
    tool({
      name: "browser_execute",
      description: "Run a validated step plan in a browser session (navigate/click/type/extract/capture…). Steps run through the queue with recovery, screenshots, recording and audit. Returns an executionId; poll browser_execution_status.",
      schema: z.object({
        sessionId: z.string().uuid(),
        goal: z.string().max(500).optional(),
        steps: stepsSchema,
        inline: z.boolean().default(false).describe("Await completion (bounded by the execution timeout) and return the final row."),
      }),
      metadata: { category: "browser", mutating: true, requiredAction: "browser.execute", defaultTimeoutMs: 120_000, version: VERSION },
      async execute(input, ctx) {
        const row = await gateway.runExecution({
          workspaceId: ctx.workspaceId, userId: ctx.userId ?? null,
          sessionId: input.sessionId, ...(input.goal ? { goal: input.goal } : {}),
          steps: input.steps, inline: input.inline,
        });
        return {
          executionId: row.id, status: row.status, stepCount: row.stepCount,
          ...(row.result ? { result: row.result } : {}),
          ...(row.error ? { error: row.error } : {}),
        };
      },
    }),
    tool({
      name: "browser_extract",
      description: "One-shot read: extract text, links, images or tables from the current page of a session.",
      schema: z.object({
        sessionId: z.string().uuid(),
        what: z.enum(["text", "links", "images", "tables"]).default("text"),
        selector: z.record(z.string(), z.unknown()).optional().describe(selectorDoc),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      metadata: { category: "browser", mutating: false, requiredAction: "browser.execute", defaultTimeoutMs: 60_000, version: VERSION },
      async execute(input, ctx) {
        const action = { text: "extract_text", links: "extract_links", images: "extract_images", tables: "extract_tables" }[input.what];
        const args: Record<string, unknown> = {};
        if (input.selector) args.selector = input.selector;
        if (input.limit && input.what !== "text") args.limit = input.limit;
        const row = await gateway.runExecution({
          workspaceId: ctx.workspaceId, userId: ctx.userId ?? null,
          sessionId: input.sessionId, goal: `extract ${input.what}`,
          steps: [{ action, args }], inline: true,
        });
        const outputs = (row.result as { outputs?: Record<string, unknown> } | null)?.outputs ?? {};
        return { status: row.status, output: outputs["1"] ?? null, error: row.error ?? null };
      },
    }),
    tool({
      name: "browser_screenshot",
      description: "Capture a screenshot of a session's current page; returns the screenshot id (fetch bytes via the Screenshots API).",
      schema: z.object({
        sessionId: z.string().uuid(),
        fullPage: z.boolean().default(false),
      }),
      metadata: { category: "browser", mutating: false, requiredAction: "browser.execute", defaultTimeoutMs: 45_000, version: VERSION },
      async execute(input, ctx) {
        const row = await gateway.runExecution({
          workspaceId: ctx.workspaceId, userId: ctx.userId ?? null,
          sessionId: input.sessionId, goal: "screenshot",
          steps: [{ action: "take_screenshot", args: { fullPage: input.fullPage } }], inline: true,
        });
        const outputs = (row.result as { outputs?: Record<string, { screenshotId?: string }> } | null)?.outputs ?? {};
        return { status: row.status, screenshotId: outputs["1"]?.screenshotId ?? null, error: row.error ?? null };
      },
    }),
  ];
}
