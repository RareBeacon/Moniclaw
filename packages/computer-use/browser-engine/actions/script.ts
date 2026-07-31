import { z } from "zod";
import { CueError } from "../../errors";
import { defineAction, jsonSafe } from "./context";

export const executeJavascriptAction = defineAction({
  id: "execute_javascript",
  name: "Execute JavaScript",
  description: "Run a JavaScript expression/function body in the page context. PERMISSION-CONTROLLED: the workspace policy must allow javascript execution.",
  category: "script",
  permission: "javascript",
  risk: "high",
  schema: z.object({
    script: z.string().min(1).max(20_000),
    arg: z.unknown().optional(),
    /** Wrap the body in an async function so it may await; evaluate resolves the returned promise. */
    async: z.boolean().default(true),
    timeoutMs: z.number().int().min(500).max(60_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("javascript");
    const page = ctx.handle.page();
    const timeout = args.timeoutMs ?? ctx.limits.actionTimeoutMs;
    // The body becomes a function invoked page-side with one JSON argument.
    // page.evaluate awaits returned promises, so async bodies resolve fully.
    const source = args.async
      ? `(async (arg) => { ${args.script} })`
      : `((arg) => { ${args.script} })`;
    const started = Date.now();
    const result = await Promise.race([
      page.evaluate(
        ({ src, argValue }) => {
          // Executed IN THE PAGE. The caller's policy layer is the only gate;
          // `use strict` prevents sloppy-mode surprises inside user bodies.
          const factory = new Function("argValue", `"use strict"; return (${src})(argValue);`);
          return factory(argValue);
        },
        { src: source, argValue: args.arg ?? null }
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new CueError("timeout", `execute_javascript exceeded ${timeout}ms`)), timeout)
      ),
    ]).catch((err) => {
      if (err instanceof CueError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new CueError("unknown", `execute_javascript threw in page: ${message.slice(0, 240)}`, { cause: err });
    });
    return { data: { result: jsonSafe(result) as unknown, durationMs: Date.now() - started } };
  },
});
