import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { leadName, agentName, companyName, offer } = body;

  const firstName = (leadName || "").split(" ")[0] || leadName;

  // Validate offer: reject if it looks like an internal campaign name
  const isCleanOffer = offer &&
    offer.length < 60 &&
    !offer.toLowerCase().includes("reaktivierung") &&
    !offer.toLowerCase().includes("roya") &&
    !offer.toLowerCase().includes("kampagne") &&
    !offer.includes("—") &&
    !offer.includes("–") &&
    !offer.match(/\d{4}/); // no years like 2026

  // Build the opener from a reliable template — no AI, no hallucination
  const intro = `Hallo ${firstName}, hier ist ${agentName}${companyName ? ` von ${companyName}` : ""}.`;
  const context = isCleanOffer
    ? `Wir hatten vor einer Weile mal Kontakt bezüglich dem ${offer}.`
    : `Wir hatten vor einer Weile schon mal Kontakt.`;
  const question = `Ist das Thema aktuell noch relevant bei dir?`;

  const opener = `${intro} ${context} ${question}`;

  return NextResponse.json({ opener });
}
