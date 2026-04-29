import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { leadName, agentName, companyName, offer, allServices, valueProp, cta } = body;

  const firstName = (leadName || "").split(" ")[0] || leadName;

  // Helper: validate that a string is a clean, user-facing product/offer description
  function isClean(s: string | undefined | null): boolean {
    if (!s || s.length < 3 || s.length >= 60) return false;
    const l = s.toLowerCase();
    return !l.includes("reaktivierung") &&
      !l.includes("roya") &&
      !l.includes("kampagne") &&
      !s.includes("—") &&
      !s.includes("–") &&
      !/\d{4}/.test(s);
  }

  // Fallback chain: offer → allServices → valueProp → cta → no product context
  const cleanOffer = isClean(offer) ? offer
    : isClean(allServices) ? allServices
    : isClean(valueProp) ? valueProp
    : isClean(cta) ? cta
    : null;

  // Template exactly matching the proven format from real conversations:
  // "Hi [Name], ich bin [Agent] von [Unternehmen]. Wir hatten vor einiger Zeit schon einmal Kontakt
  //  wegen unseres [Angebot]. Ich wollte mich kurz bei dir melden und nachfragen,
  //  ob das Thema aktuell noch interessant für dich ist?"
  const intro = `Hi ${firstName}, ich bin ${agentName}${companyName ? ` von ${companyName}` : ""}.`;
  const context = cleanOffer
    ? `Wir hatten vor einiger Zeit schon einmal Kontakt wegen unseres ${cleanOffer}.`
    : `Wir hatten vor einiger Zeit schon einmal Kontakt.`;
  const question = `Ich wollte mich kurz bei dir melden und nachfragen, ob das Thema aktuell noch interessant für dich ist?`;

  const opener = `${intro} ${context} ${question}`;

  return NextResponse.json({ opener, hasProductContext: !!cleanOffer });
}
