import { NextResponse } from "next/server";
import * as campaignStore from "@/lib/campaign-store";
import * as convStore from "@/lib/conversation-store";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const campaigns = await campaignStore.globalStats();
  const convs = await convStore.getAll();

  // Escalation count
  let openEscalations = 0;
  try {
    const { count } = await supabase
      .from('handoff_queue')
      .select('*', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']);
    openEscalations = count ?? 0;
  } catch { /* table may not exist yet */ }

  return NextResponse.json({
    campaigns,
    conversations: {
      total:        convs.length,
      active:       convs.filter(c => c.state === "active").length,
      replied:      convs.filter(c => c.state === "replied").length,
      booked:       convs.filter(c => c.state === "booked").length,
      humanNeeded:  convs.filter(c => c.state === "human_needed").length,
    },
    escalations: {
      open: openEscalations,
    },
    recentActivity: convs
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, 8)
      .map(c => ({
        id: c.id,
        leadName: c.leadName,
        channel: c.channel,
        state: c.state,
        lastActivity: c.lastActivity,
        lastMessage: c.messages[c.messages.length - 1]?.body || "",
        lastRole: c.messages[c.messages.length - 1]?.role || "agent",
        intent: c.lastIntent?.intent,
        intentConf: c.lastIntent?.confidence,
      })),
  });
}
