import { z } from "zod";
import type { Tool } from "../tool";
import { evaluateExpression } from "./expression";

/** Deterministic, side-effect-free tools available to every workspace. */

export const calculatorTool: Tool = {
  name: "calculator",
  description:
    "Evaluate an arithmetic expression. Supports + - * / % ^ (power), parentheses, and unary minus. Example: (12*8)+4^2",
  schema: z.object({
    expression: z.string().min(1).max(500).describe("The arithmetic expression to evaluate."),
  }),
  metadata: { category: "compute", mutating: false, version: "1.0.0", defaultTimeoutMs: 5_000 },
  async execute({ expression }) {
    const value = evaluateExpression(expression);
    if (!Number.isFinite(value)) throw new Error("Expression result is not finite.");
    return { expression, value };
  },
};

export const datetimeTool: Tool = {
  name: "datetime",
  description: "Get the current date/time in UTC or a specific IANA timezone.",
  schema: z.object({
    timezone: z
      .string()
      .max(64)
      .optional()
      .describe("IANA timezone, e.g. Africa/Lagos. Defaults to UTC."),
    format: z.enum(["iso", "human", "unix"]).optional(),
  }),
  metadata: { category: "compute", mutating: false, version: "1.0.0", defaultTimeoutMs: 5_000 },
  async execute({ timezone, format }) {
    const tz = timezone || "UTC";
    const now = new Date();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      throw new Error(`Unknown timezone: ${tz}`);
    }
    if (format === "unix") return { timezone: tz, unix: Math.floor(now.getTime() / 1000) };
    if (format === "human") {
      return {
        timezone: tz,
        text: new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          dateStyle: "full",
          timeStyle: "long",
        }).format(now),
      };
    }
    return {
      timezone: tz,
      iso: tz === "UTC"
        ? now.toISOString()
        : new Intl.DateTimeFormat("sv-SE", {
            timeZone: tz,
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false,
          }).format(now).replace(" ", "T") + ".000Z",
    };
  },
};

export const jsonTransformTool: Tool = {
  name: "json_transform",
  description:
    "Query/transform JSON data without code. Operations: get(path), pluck(path) over an array, keys(), count(). Path syntax: a.b.0.c",
  schema: z.object({
    data: z.unknown().describe("The JSON value to transform."),
    operation: z.enum(["get", "pluck", "keys", "count"]),
    path: z.string().max(300).optional().describe("Dot path (required for get/pluck)."),
  }),
  metadata: { category: "compute", mutating: false, version: "1.0.0", defaultTimeoutMs: 5_000 },
  async execute({ data, operation, path }) {
    const getAt = (value: unknown, dotPath: string): unknown =>
      dotPath.split(".").reduce<unknown>((acc, seg) => {
        if (acc === null || acc === undefined) return undefined;
        return (acc as Record<string, unknown>)[seg];
      }, data && value !== undefined ? value : data);

    switch (operation) {
      case "get": {
        if (!path) throw new Error("path is required for get.");
        return { value: getAt(data, path) };
      }
      case "pluck": {
        if (!path) throw new Error("path is required for pluck.");
        if (!Array.isArray(data)) throw new Error("pluck requires an array input.");
        return { value: data.map((item) => getAt(item, path)) };
      }
      case "keys":
        if (typeof data !== "object" || data === null) throw new Error("keys requires an object.");
        return { value: Object.keys(data as Record<string, unknown>) };
      case "count": {
        if (Array.isArray(data)) return { value: data.length };
        if (typeof data === "object" && data !== null) {
          return { value: Object.keys(data).length };
        }
        if (typeof data === "string") return { value: data.length };
        return { value: 0 };
      }
    }
  },
};
