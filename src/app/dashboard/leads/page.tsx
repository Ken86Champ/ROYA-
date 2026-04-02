import { redirect } from "next/navigation";
// Reaktivierung-Übersicht war leer. Neue Kampagne startet unter Kampagnen.
export default function LeadsRedirect() {
  redirect("/dashboard/campaigns");
}
