-- ═══════════════════════════════════════════════════════════════════
-- Phase 9 Migration: Contact Import & CRM Management
-- Tables: roya_clients, roya_contacts, contact_imports
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) roya_clients — CRM clients (linked to agencies) ────────────
CREATE TABLE IF NOT EXISTS roya_clients (
  id              TEXT  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id       TEXT  NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name            TEXT  NOT NULL,
  industry        TEXT,
  website         TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roya_clients_agency ON roya_clients(agency_id);

ALTER TABLE roya_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY roya_clients_service ON roya_clients
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 2) roya_contacts — CRM contacts ───────────────────────────────
CREATE TABLE IF NOT EXISTS roya_contacts (
  id                TEXT  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id         TEXT  NOT NULL,
  client_id         TEXT,
  first_name        TEXT,
  last_name         TEXT,
  email             TEXT,
  phone             TEXT,
  company           TEXT,
  job_title         TEXT,
  segment           TEXT,                -- hot | warm | cold | lost
  state             TEXT  NOT NULL DEFAULT 'not_contacted',
  deal_value        NUMERIC,
  loss_reason       TEXT,
  original_interest TEXT,
  unsubscribed_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roya_contacts_agency     ON roya_contacts(agency_id);
CREATE INDEX IF NOT EXISTS idx_roya_contacts_client     ON roya_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_roya_contacts_email      ON roya_contacts(email);
CREATE INDEX IF NOT EXISTS idx_roya_contacts_phone      ON roya_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_roya_contacts_state      ON roya_contacts(state);
CREATE INDEX IF NOT EXISTS idx_roya_contacts_segment    ON roya_contacts(segment);
CREATE INDEX IF NOT EXISTS idx_roya_contacts_created    ON roya_contacts(created_at DESC);

ALTER TABLE roya_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY roya_contacts_service ON roya_contacts
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 3) contact_imports — audit log for bulk imports ────────────────
CREATE TABLE IF NOT EXISTS contact_imports (
  id               TEXT  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id        TEXT  NOT NULL,
  client_id        TEXT,
  total_rows       INTEGER NOT NULL DEFAULT 0,
  imported_count   INTEGER NOT NULL DEFAULT 0,
  duplicate_count  INTEGER NOT NULL DEFAULT 0,
  invalid_count    INTEGER NOT NULL DEFAULT 0,
  opted_out_count  INTEGER NOT NULL DEFAULT 0,
  deduplicate_by   TEXT  NOT NULL DEFAULT 'email',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_imports_agency ON contact_imports(agency_id);

ALTER TABLE contact_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_imports_service ON contact_imports
  FOR ALL USING (true) WITH CHECK (true);

-- ─── 4) Ensure demo agency exists, then seed demo client ────────────
INSERT INTO agencies (id, name, plan)
VALUES ('demo-agency', 'Agentur Demo', 'starter')
ON CONFLICT (id) DO NOTHING;

INSERT INTO roya_clients (id, agency_id, name, industry)
VALUES ('demo-client', 'demo-agency', 'Demo Kunde', 'SaaS')
ON CONFLICT (id) DO NOTHING;
