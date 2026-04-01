// ─── Client Store (Supabase-backed) ───────────────────────────────────────────

import { supabase, genId } from "./supabase";

export interface Client {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  industry: string;
  notes: string;
  createdAt: string;
  campaignIds: string[];
  stats: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalContacts: number;
    totalBooked: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function attachStats(clients: Client[]): Promise<Client[]> {
  if (!clients.length) return clients;
  const ids = clients.map(c => c.id);

  // Fetch all campaigns for these clients
  const { data: camps } = await supabase
    .from("campaigns")
    .select("id, client_id, status")
    .in("client_id", ids);

  const { data: contacts } = await supabase
    .from("campaign_contacts")
    .select("campaign_id, status")
    .in("campaign_id", (camps ?? []).map(c => c.id));

  return clients.map(client => {
    const myCamps   = (camps ?? []).filter(c => c.client_id === client.id);
    const campIds   = myCamps.map(c => c.id);
    const myContacts = (contacts ?? []).filter(c => campIds.includes(c.campaign_id));

    return {
      ...client,
      campaignIds: campIds,
      stats: {
        totalCampaigns:  myCamps.length,
        activeCampaigns: myCamps.filter(c => c.status === "active").length,
        totalContacts:   myContacts.length,
        totalBooked:     myContacts.filter(c => c.status === "booked").length,
      },
    };
  });
}

function rowToClient(r: Record<string, unknown>): Client {
  return {
    id:          r.id as string,
    company:     r.company as string,
    contact:     r.contact as string ?? "",
    email:       r.email as string ?? "",
    phone:       r.phone as string ?? "",
    industry:    r.industry as string ?? "",
    notes:       r.notes as string ?? "",
    createdAt:   r.created_at as string,
    campaignIds: [],
    stats:       { totalCampaigns: 0, activeCampaigns: 0, totalContacts: 0, totalBooked: 0 },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getAll(): Promise<Client[]> {
  const { data: rows } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (!rows?.length) return [];
  const clients = rows.map(rowToClient);
  return attachStats(clients);
}

export async function getById(id: string): Promise<Client | null> {
  const { data: row } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!row) return null;
  const [client] = await attachStats([rowToClient(row)]);
  return client;
}

export async function create(params: Omit<Client, "id" | "createdAt" | "campaignIds" | "stats">): Promise<Client> {
  const id  = genId("client");
  const now = new Date().toISOString();

  await supabase.from("clients").insert({
    id, company: params.company, contact: params.contact,
    email: params.email, phone: params.phone,
    industry: params.industry, notes: params.notes,
    created_at: now,
  });

  return {
    ...params, id, createdAt: now, campaignIds: [],
    stats: { totalCampaigns: 0, activeCampaigns: 0, totalContacts: 0, totalBooked: 0 },
  };
}

export async function linkCampaign(clientId: string, campaignId: string): Promise<void> {
  // Just ensure the campaign has the correct client_id set (already done in create)
  await supabase.from("campaigns").update({ client_id: clientId }).eq("id", campaignId);
}
