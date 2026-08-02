import { Clock3, LogOut, ShieldAlert } from "lucide-react";
import { signOut } from "@/auth";
import { accessMessage, type AccessState } from "@/lib/access";

export function AccessSuspended({ state }: { state: AccessState }) {
  const pending = state === "pending";
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6"><section className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">{pending ? <Clock3 className="h-7 w-7 text-amber-600"/> : <ShieldAlert className="h-7 w-7 text-destructive"/>}</span>
    <h1 className="mt-5 text-2xl font-semibold">{pending ? "Awaiting activation" : state === "expired" ? "Access expired" : "Access suspended"}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{accessMessage(state)} You can sign in normally once the owner updates your account.</p>
    <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} className="mt-7"><button className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary"><LogOut className="h-4 w-4"/>Sign out</button></form>
  </section></main>;
}
