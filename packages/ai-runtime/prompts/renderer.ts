import { z } from "zod";

/**
 * Prompt template engine — renders {{variable}} placeholders with strict
 * validation, composes layered prompts (system → workspace → agent → task),
 * and never throws unvalidated content into the model.
 *
 * Syntax: triple-stash is NOT supported (no raw-HTML escape hatch — this is
 * prompt engineering, not HTML templating). Conditionals/loops are handled
 * by composing partials in code, keeping templates readable for operators.
 */

export const promptVariableSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Variable names must be identifiers."),
  description: z.string().max(280).optional(),
  default: z.string().optional(),
  required: z.boolean().default(false),
});
export type PromptVariable = z.infer<typeof promptVariableSchema>;

export const promptVariablesSchema = z.array(promptVariableSchema).max(32);

const PLACEHOLDER = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export interface RenderResult {
  rendered: string;
  /** Variables declared on the template. */
  declared: string[];
  /** Placeholders present in the content (declared or not). */
  used: string[];
  warnings: string[];
}

export function renderPrompt(
  content: string,
  declared: PromptVariable[],
  values: Record<string, string>
): RenderResult {
  const warnings: string[] = [];
  const declaredMap = new Map(declared.map((v) => [v.name, v]));

  // 1 · every REQUIRED declared variable must be satisfied (value or default)
  for (const v of declared) {
    if (v.required && values[v.name] === undefined && v.default === undefined) {
      throw new PromptRenderError(
        `Missing required variable "${v.name}".`,
        v.name
      );
    }
  }

  // 2 · render
  const used = new Set<string>();
  const rendered = content.replace(PLACEHOLDER, (_raw, name: string) => {
    used.add(name);
    const variable = declaredMap.get(name);
    if (values[name] !== undefined) return values[name];
    if (variable?.default !== undefined) return variable.default;
    if (variable) {
      warnings.push(`Variable "${name}" rendered empty (no value, no default).`);
      return "";
    }
    warnings.push(`Undeclared placeholder "${name}" left intact.`);
    return `{{${name}}}`;
  });

  // 3 · warn on supplied-but-unused values (usually a typo)
  for (const key of Object.keys(values)) {
    if (!used.has(key)) warnings.push(`Supplied value "${key}" is not used by the template.`);
  }

  return {
    rendered,
    declared: declared.map((v) => v.name),
    used: [...used],
    warnings,
  };
}

export class PromptRenderError extends Error {
  constructor(
    message: string,
    readonly variable?: string
  ) {
    super(message);
    this.name = "PromptRenderError";
  }
}

/**
 * Compose the effective system prompt for a run from layered templates.
 * Any layer may be absent; layers join with a blank line. End-user input is
 * never part of the system layer (prompt-injection hygiene).
 */
export function composeSystemPrompt(layers: {
  system?: string;
  workspace?: string;
  agent?: string;
  task?: string;
}): string {
  return [layers.system, layers.workspace, layers.agent, layers.task]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join("\n\n");
}
