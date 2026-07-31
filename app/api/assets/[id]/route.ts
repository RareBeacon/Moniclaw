import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";

/**
 * Streams a stored asset. Authorization:
 *  • AVATAR — visible to the owning user or members of the same workspace
 *  • everything else — requires membership of the asset's workspace
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Cheap format guard — IDs are UUIDs; anything else is a guaranteed miss.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const asset = await db.asset.findUnique({ where: { id } });
  if (!asset || !asset.content) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (asset.kind === "AVATAR") {
    const isOwner = asset.createdById === user.id;
    if (!isOwner) {
      const primary = await getPrimaryWorkspace(user.id);
      if (!asset.workspaceId || primary?.workspace.id !== asset.workspaceId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else {
    const primary = await getPrimaryWorkspace(user.id);
    if (!asset.workspaceId || primary?.workspace.id !== asset.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const isDownload = asset.kind !== "AVATAR";
  return new NextResponse(new Uint8Array(asset.content), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.sizeBytes),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(isDownload
        ? { "Content-Disposition": `attachment; filename="${asset.name}"` }
        : {}),
    },
  });
}
