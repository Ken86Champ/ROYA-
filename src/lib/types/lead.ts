// ─── ROYA V2 — Lead Types ─────────────────────────────────────────────────────

export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  phone?: string;
  email?: string;
  company?: string;
  source?: string;
  segment?: 'hot' | 'warm' | 'cold' | 'dormant';
  language: string;
  timezone?: string;
  status: 'active' | 'opted_out' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface LeadRow {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  phone?: string;
  email?: string;
  company?: string;
  source?: string;
  segment?: string;
  language: string;
  timezone?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    source: row.source,
    segment: row.segment as Lead['segment'],
    language: row.language || 'de',
    timezone: row.timezone,
    status: (row.status || 'active') as Lead['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
