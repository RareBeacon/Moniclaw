"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useFormState } from "react-dom";

import { createAgent, type ActionState } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ActionState = {};

const categories = [
  { value: "sales", label: "Sales & Pipeline" },
  { value: "support", label: "Customer Support" },
  { value: "finance", label: "Finance & Ops" },
  { value: "marketing", label: "Marketing & Content" },
  { value: "hr", label: "HR & Recruiting" },
  { value: "research", label: "Data & Research" },
  { value: "engineering", label: "Engineering & QA" },
  { value: "executive", label: "Executive Ops" },
];

export function NewAgentForm() {
  const [state, formAction] = useFormState(createAgent, initialState);
  const [trigger, setTrigger] = React.useState("MANUAL");
  const [description, setDescription] = React.useState("");
  const [errors, setErrors] = React.useState<{ name?: string; description?: string; schedule?: string }>({});
  const [pending, setPending] = React.useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const schedule = (form.elements.namedItem("schedule") as HTMLInputElement)?.value.trim();
    const errs: typeof errors = {};
    if (name.length < 2) errs.name = "Give the agent a name.";
    if (description.trim().length < 30)
      errs.description = "A useful job description needs at least 30 characters.";
    if (trigger === "SCHEDULE" && !schedule)
      errs.schedule = "Add a cron expression, e.g. 0 6 * * 1-5.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      e.preventDefault();
      return;
    }
    setPending(true);
  };

  React.useEffect(() => {
    if (state.error) setPending(false);
  }, [state]);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-6">
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent name</Label>
          <Input
            id="agent-name"
            name="name"
            placeholder='e.g. "Mara" — AR reconciler'
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p role="alert" className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-category">Department</Label>
          <select
            id="agent-category"
            name="category"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Unassigned</option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="agent-description">Job description</Label>
          <span className="text-xs text-muted-foreground">
            {description.length}/2000 · min 30
          </span>
        </div>
        <Textarea
          id="agent-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          placeholder={
            "Write it like a brief to a new hire:\n\n• The goal and the definition of done\n• The tools and systems involved\n• The rules — what requires approval, budgets, working hours\n• What to do when unsure (the answer is: stop and escalate)"
          }
          className="min-h-[180px]"
          aria-invalid={!!errors.description}
        />
        {errors.description && (
          <p role="alert" className="text-xs text-destructive">{errors.description}</p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agent-trigger">Trigger</Label>
          <select
            id="agent-trigger"
            name="trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="MANUAL">Manual — you start each run</option>
            <option value="SCHEDULE">Schedule — cron</option>
            <option value="WEBHOOK">Webhook — on external event</option>
          </select>
        </div>
        {trigger === "SCHEDULE" && (
          <div className="space-y-2">
            <Label htmlFor="agent-schedule">Cron expression</Label>
            <Input
              id="agent-schedule"
              name="schedule"
              placeholder="0 6 * * 1-5  (weekdays 06:00, UTC)"
              aria-invalid={!!errors.schedule}
            />
            {errors.schedule && (
              <p role="alert" className="text-xs text-destructive">{errors.schedule}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-accent/40 p-4 text-xs leading-5 text-muted-foreground">
        <strong className="text-foreground">What happens next:</strong> the
        agent is created as a <strong className="text-foreground">draft</strong>{" "}
        with a default policy (approval for any spend, $25/day budget).
        Promote it to shadow mode to dry-run against live data, then to
        supervised and autonomous as its evidence earns trust.
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Creating agent…
            </>
          ) : (
            "Create draft agent"
          )}
        </Button>
      </div>
    </form>
  );
}
