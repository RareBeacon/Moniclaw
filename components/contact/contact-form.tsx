"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const topics = [
  { value: "sales", label: "Sales & pricing" },
  { value: "support", label: "Product support" },
  { value: "security", label: "Security & compliance" },
  { value: "press", label: "Press & partnerships" },
  { value: "careers", label: "Careers" },
];

type Errors = Partial<Record<"name" | "email" | "message", string>>;

export function ContactForm({ initialTopic = "sales" }: { initialTopic?: string }) {
  const [values, setValues] = React.useState({
    name: "",
    email: "",
    company: "",
    topic: topics.some((t) => t.value === initialTopic)
      ? initialTopic
      : "sales",
    message: "",
  });
  const [errors, setErrors] = React.useState<Errors>({});
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent">("idle");

  const set = (field: keyof typeof values) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: Errors = {};
    if (values.name.trim().length < 2) next.name = "Your name, please.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
      next.email = "A valid work email helps us reply.";
    if (values.message.trim().length < 20)
      next.message = "Give us at least a sentence or two — 20 characters minimum.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setStatus("sending");
    // Delivery (CRM + ticketing bridge) ships with the backend milestone.
    await new Promise((r) => setTimeout(r, 900));
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold">Message received, {values.name.split(" ")[0]}</h2>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Thanks for reaching out about{" "}
          <strong className="text-foreground">
            {topics.find((t) => t.value === values.topic)?.label.toLowerCase()}
          </strong>
          . A human — not an agent, on this one — will reply to{" "}
          <strong className="text-foreground">{values.email}</strong> within one
          business day.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-5 rounded-2xl border bg-card p-7 shadow-sm sm:grid-cols-2 sm:p-8"
    >
      <div className="grid gap-2">
        <Label htmlFor="contact-name">Full name</Label>
        <Input
          id="contact-name"
          autoComplete="name"
          placeholder="Ada Lovelace"
          value={values.name}
          onChange={set("name")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
        />
        {errors.name && (
          <p id="contact-name-error" role="alert" className="text-xs text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-email">Work email</Label>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          placeholder="ada@company.com"
          value={values.email}
          onChange={set("email")}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
        />
        {errors.email && (
          <p id="contact-email-error" role="alert" className="text-xs text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-company">
          Company <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="contact-company"
          autoComplete="organization"
          placeholder="Acme Industries"
          value={values.company}
          onChange={set("company")}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-topic">Topic</Label>
        <select
          id="contact-topic"
          value={values.topic}
          onChange={set("topic")}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {topics.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="contact-message">How can we help?</Label>
        <Textarea
          id="contact-message"
          placeholder="Tell us about the workflow you're considering — current volume, tools involved, and what 'done' looks like for you."
          value={values.message}
          onChange={set("message")}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          className="min-h-[140px]"
        />
        {errors.message && (
          <p id="contact-message-error" role="alert" className="text-xs text-destructive">
            {errors.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          We only use your details to reply. See our{" "}
          <a href="/legal/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
        <Button type="submit" size="lg" disabled={status === "sending"}>
          {status === "sending" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              Send message
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
