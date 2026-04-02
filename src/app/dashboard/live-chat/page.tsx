import { redirect } from "next/navigation";
// Live Chat wurde in Gespräche → Tab "Live SMS" zusammengeführt.
export default function LiveChatRedirect() {
  redirect("/dashboard/conversations");
}
