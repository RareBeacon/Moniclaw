import { z } from "zod";

/**
 * Zod → JSON Schema for tool parameters.
 *
 * Delegates to Zod 4's native `z.toJSONSchema` (battle-tested across the
 * whole Zod surface), then normalizes to the minimal object shape providers
 * expect: no `$schema` key, top level MUST be an object.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    // Models read "description" — Zod 4 emits them for .describe() fields.
    unrepresentable: "any",
    override: (ctx) => {
      // Drop $schema markers from nested output (providers reject them).
      const jsonSchema = ctx.jsonSchema as Record<string, unknown>;
      delete jsonSchema.$schema;
    },
  }) as Record<string, unknown>;

  delete converted.$schema;
  if (converted.type !== "object") {
    throw new Error("Tool schemas must be Zod objects at the top level.");
  }
  if (!("properties" in converted)) converted.properties = {};
  if (!("required" in converted)) converted.required = [];
  return converted;
}
