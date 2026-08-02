"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { userId: string; status: "ACTIVE" | "PENDING" | "SUSPENDED"; accessUntil: string | null; note: string | null };
export function AdminUserActions({ userId, status, accessUntil, note }: Props) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(operation: string, withDate = false) {
    let accessUntilValue: string | null | undefined = undefined;
    if (withDate) { const value = window.prompt("Expiry date (YYYY-MM-DD). Leave blank for no expiry.", accessUntil ? accessUntil.slice(0,10) : ""); if (value === null) return; accessUntilValue = value || null; }
    const accessNote = window.prompt("Access note (optional — e.g. paid by bank transfer).", note ?? ""); if (accessNote === null) return;
    setBusy(true); setError("");
    const res = await fetch("/api/admin/users/" + userId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, accessUntil: accessUntilValue, accessNote }) });
    const body = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setError(body.message ?? "The change could not be saved."); return; } router.refresh();
  }
  async function remove() { if (!window.confirm("Delete this account? It will lose access immediately and the seat will be freed.")) return; setBusy(true); const res=await fetch("/api/admin/users/"+userId,{method:"DELETE"}); const body=await res.json().catch(()=>({}));setBusy(false);if(!res.ok){setError(body.message??"Could not delete this account.");return;}router.refresh(); }
  return <div className="flex flex-wrap items-center justify-end gap-2">
    {status === "PENDING" && <button disabled={busy} onClick={() => submit("approve", true)} className="rounded border border-emerald-600 px-2 py-1 text-xs font-medium text-emerald-700">Approve</button>}
    {status !== "SUSPENDED" && <button disabled={busy} onClick={() => submit("suspend")} className="rounded border px-2 py-1 text-xs font-medium">Suspend</button>}
    {status === "SUSPENDED" && <button disabled={busy} onClick={() => submit("reactivate", true)} className="rounded border border-emerald-600 px-2 py-1 text-xs font-medium text-emerald-700">Reactivate</button>}
    {status === "ACTIVE" && <button disabled={busy} onClick={() => submit("extend", true)} className="rounded border px-2 py-1 text-xs font-medium">Set date</button>}
    <button disabled={busy} onClick={remove} className="rounded border border-destructive px-2 py-1 text-xs font-medium text-destructive">Delete</button>
    {error && <p className="basis-full text-xs text-destructive">{error}</p>}
  </div>;
}
