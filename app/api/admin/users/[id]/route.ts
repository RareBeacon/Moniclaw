import { NextResponse } from "next/server";
import { changePlatformAccess, requirePlatformOwner } from "@/lib/admin-access";

function dateOrNull(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(`${String(value)}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !["approve","extend","suspend","reactivate"].includes(String(body.operation))) return NextResponse.json({ error: "invalid_request", message: "Choose a valid access action." }, { status: 400 });
  const rawDate = dateOrNull(body.accessUntil); if (body.accessUntil !== undefined && rawDate === undefined) return NextResponse.json({ error: "invalid_date", message: "Use a valid expiry date." }, { status: 400 });
  const result = await changePlatformAccess({ targetId: params.id, operation: body.operation as "approve"|"extend"|"suspend"|"reactivate", until: rawDate, note: typeof body.accessNote === "string" ? body.accessNote.slice(0, 2000) || null : undefined });
  return result.error ? NextResponse.json({ error: "forbidden", message: result.error }, { status: 403 }) : NextResponse.json({ ok: true });
}
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const result = await changePlatformAccess({ targetId: params.id, operation: "delete" });
  return result.error ? NextResponse.json({ error: "forbidden", message: result.error }, { status: 403 }) : NextResponse.json({ ok: true });
}
