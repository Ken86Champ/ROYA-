import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/client-store";

export async function GET() {
  return NextResponse.json(await store.getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const client = await store.create({
    company: body.company,
    contact: body.contact || "",
    email: body.email,
    phone: body.phone || "",
    industry: body.industry || "",
    notes: body.notes || "",
  });
  return NextResponse.json(client, { status: 201 });
}
