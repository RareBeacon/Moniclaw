import { browserToolProvider, type BrowserGateway } from "@cue/index";
import type { Tool } from "@runtime/tools/tool";

/**
 * Browser tools for the AI Runtime — registered into the shared ToolRegistry
 * so chat/planner/workflows can drive real browser sessions through the SAME
 * executor (auditing, timeouts, RBAC) as every other tool.
 *
 * Decoupling: tool definitions are static zod schemas (zero playwright
 * import cost at boot); execution resolves the browser runtime LAZILY via
 * dynamic import — chat routes never construct the engine unless a browser
 * tool actually runs.
 */
const lazyGateway: BrowserGateway = {
  async createSession(input) {
    const { getBrowserRuntime } = await import("@/lib/browser/runtime");
    return getBrowserRuntime().gateway.createSession(input);
  },
  async closeSession(sessionId, workspaceId, userId) {
    const { getBrowserRuntime } = await import("@/lib/browser/runtime");
    return getBrowserRuntime().gateway.closeSession(sessionId, workspaceId, userId);
  },
  async getSession(sessionId, workspaceId) {
    const { getBrowserRuntime } = await import("@/lib/browser/runtime");
    return getBrowserRuntime().gateway.getSession(sessionId, workspaceId);
  },
  async runExecution(input) {
    const { getBrowserRuntime } = await import("@/lib/browser/runtime");
    return getBrowserRuntime().gateway.runExecution(input);
  },
  async tabList(sessionId, workspaceId) {
    const { getBrowserRuntime } = await import("@/lib/browser/runtime");
    return getBrowserRuntime().gateway.tabList(sessionId, workspaceId);
  },
};

export function browserTools(): Tool[] {
  // ToolShape is structurally compatible with the runtime Tool interface.
  return browserToolProvider(lazyGateway) as unknown as Tool[];
}
