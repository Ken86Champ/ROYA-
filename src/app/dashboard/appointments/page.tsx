import { redirect } from "next/navigation";
// Termine sind unter Gespräche → Filter "Gebucht" einsehbar.
export default function AppointmentsRedirect() {
  redirect("/dashboard/conversations");
}
