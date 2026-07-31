/**
 * Research worker — prompt assets + report synthesis.
 *
 * Pipeline posture: the worker's goal is wrapped in a research preamble (the
 * planner then decomposes with a research-shaped plan); after execution, the
 * synthesizer turns the step trace into a cited, zod-validated report.
 * Model output is treated as untrusted input everywhere.
 */
import { z } from "zod";
import type { ModelRouter } from "@runtime/model-router/router";
import type { StepTrace } from "@runtime/planner/planner";
import { AgentError } from "./errors";
import type { PlannerCtx, SynthesizerPort, SynthesisInput } from "./ports";
import { researchReportSchema, type ResearchReport } from "./types";

export const RESEARCH_PREAMBLE =
  "You are a research worker inside a governed enterprise platform. " +
  "Your mission: investigate the goal with whatever read-only tools you have " +
  "(web pages, the workspace knowledge base, memory). " +
  "Rules: prefer primary sources; capture URLs for every claim; never invent facts; " +
  "keep tool calls few and purposeful; note gaps honestly instead of guessing.";

export const OPS_PREAMBLE =
  "You are an operations worker inside a governed enterprise platform. " +
  "Execute the goal precisely and conservatively. Prefer reading before writing; " +
  "any step with external side effects must be marked requiresApproval; " +
  "when uncertain, stop and report rather than improvise.";

export function preambleFor(workerType: string): string {
  if (workerType === "research") return RESEARCH_PREAMBLE;
  if (workerType === "ops") return OPS_PREAMBLE;
  return "";
}

const synthesisEnvelope = z.object({
  title: z.string().min(3).max(300),
  summary: z.string().min(10).max(4000),
  markdown: z.string().min(10).max(60000),
  citations: z.array(z.object({
    url: z.string().url().max(2000),
    title: z.string().max(500).default(""),
  })).max(50).default([]),
});

/** ModelRouter-backed synthesizer (the app binds this; tests fake it). */
export class ResearchSynthesizer implements SynthesizerPort {
  constructor(private readonly router: ModelRouter) {}

  async synthesize(ctx: PlannerCtx, input: SynthesisInput): Promise<ResearchReport | null> {
    const sourceList = input.sources.length > 0
      ? input.sources.map((s, i) => `${i + 1}. ${s.title || "(untitled)"} — ${s.url}`).join("\n")
      : "(no external sources captured)";
    const response = await this.router.chat(ctx, {
      messages: [
        {
          role: "system",
          content:
            "You compile research findings into a rigorous report. " +
            "Output ONLY JSON: {title, summary, markdown, citations:[{url,title}]}. " +
            "Citations MUST come from the provided source list — never invent URLs. " +
            "markdown = the full report with sections, evidence and open questions.",
        },
        {
          role: "user",
          content:
            `GOAL:\n${input.goal}\n\nSTEP DIGEST:\n${input.stepDigest}\n\nSOURCES:\n${sourceList}`,
        },
      ],
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 4000,
      requestId: ctx.requestId,
    });

    let raw: unknown;
    try {
      raw = JSON.parse(response.content);
    } catch {
      throw new AgentError("upstream_failed", "Synthesis returned non-JSON output.");
    }
    const parsed = synthesisEnvelope.safeParse(raw);
    if (!parsed.success) {
      throw new AgentError("upstream_failed", `Synthesis failed validation: ${parsed.error.issues[0]?.message}`);
    }
    return researchReportSchema.parse(parsed.data);
  }
}

/** Extract a deduped, title-bearing source list from a planner trace. */
export function sourcesFromTrace(trace: StepTrace[]): Array<{ url: string; title: string }> {
  const seen = new Map<string, { url: string; title: string }>();

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const url = obj.url;
      if (typeof url === "string" && /^https?:\/\//i.test(url) && url.length <= 2000) {
        if (!seen.has(url)) {
          const title = typeof obj.title === "string" ? obj.title.slice(0, 500) : "";
          seen.set(url, { url, title });
        }
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object") walk(v);
      }
    }
  };

  for (const t of trace) walk(t.output);
  return [...seen.values()].slice(0, 50);
}

/** Concise per-step digest for prompts and the dashboard. */
export function digestTrace(trace: StepTrace[]): string {
  return trace
    .map((t, i) => {
      const tool = t.step.tool ? ` [${t.step.tool}]` : "";
      const err = t.error ? ` — error: ${t.error.slice(0, 120)}` : "";
      return `${i + 1}. ${t.status}${tool} ${t.step.description}${err}`;
    })
    .join("\n")
    .slice(0, 6000);
}
