import { NextRequest, NextResponse } from "next/server";
import { getFramework, updateFramework, deleteFramework, duplicateFramework } from "@/lib/framework-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const fw = await getFramework(id);
    if (!fw) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(fw);
  } catch (err) {
    console.error("[API /api/frameworks/[id]] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Duplicate action
    if (body.action === "duplicate") {
      const dup = await duplicateFramework(id, body.newName || "Kopie", body.agencyId);
      if (!dup) return NextResponse.json({ error: "source not found" }, { status: 404 });
      return NextResponse.json(dup, { status: 201 });
    }

    // Prevent editing system frameworks
    const existing = await getFramework(id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (existing.isSystem) {
      return NextResponse.json({ error: "System-Frameworks können nicht bearbeitet werden. Erstelle eine Kopie." }, { status: 403 });
    }

    await updateFramework(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API /api/frameworks/[id]] PATCH error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getFramework(id);
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (existing.isSystem) {
      return NextResponse.json({ error: "System-Frameworks können nicht gelöscht werden." }, { status: 403 });
    }

    await deleteFramework(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API /api/frameworks/[id]] DELETE error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
