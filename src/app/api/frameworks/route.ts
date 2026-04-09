import { NextRequest, NextResponse } from "next/server";
import { listFrameworks, createFramework, seedSystemFrameworks } from "@/lib/framework-store";

export async function GET(req: NextRequest) {
  try {
    const agencyId = req.nextUrl.searchParams.get("agencyId") ?? undefined;

    // Auto-seed system frameworks on first read
    await seedSystemFrameworks();

    const frameworks = await listFrameworks(agencyId);
    return NextResponse.json(frameworks);
  } catch (err) {
    console.error("[API /api/frameworks] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, agencyId, writerInstructions, strategistInstructions, interpreterInstructions, rules, forbiddenPhrases, temperature, exampleMessages } = body;

    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const fw = await createFramework({
      name,
      description: description || "",
      agencyId: agencyId || undefined,
      isSystem: false,
      writerInstructions: writerInstructions || "",
      strategistInstructions: strategistInstructions || "",
      interpreterInstructions: interpreterInstructions || "",
      rules: rules || [],
      forbiddenPhrases: forbiddenPhrases || [],
      temperature: Number(temperature) || 0.5,
      exampleMessages: exampleMessages || [],
    });

    return NextResponse.json(fw, { status: 201 });
  } catch (err) {
    console.error("[API /api/frameworks] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
