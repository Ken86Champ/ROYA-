import { pgTable, text, timestamp, integer, boolean, real, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const contactSegmentEnum = pgEnum("contact_segment", ["hot", "warm", "cold", "lost"]);
export const contactStateEnum = pgEnum("contact_state", [
  "not_contacted", "first_message_sent", "replied_positive", "replied_negative",
  "qualified", "booking_pushed", "booked", "dead"
]);
export const channelEnum = pgEnum("channel", ["email", "sms", "whatsapp"]);
export const planEnum = pgEnum("plan", ["starter", "growth", "agency", "enterprise"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "invoiced", "paid"]);

export const agencies = pgTable("agencies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  plan: planEnum("plan").default("starter").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agencyUsers = pgTable("agency_users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").default("member").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const royaClients = pgTable("roya_clients", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  name: text("name").notNull(),
  calendarUrl: text("calendar_url"),
  commissionModel: text("commission_model").default("fixed").notNull(),
  commissionValue: real("commission_value").default(0),
  offerContext: text("offer_context"),
  mailgunApiKey: text("mailgun_api_key"),
  mailgunDomain: text("mailgun_domain"),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const royaContacts = pgTable("roya_contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  clientId: text("client_id").references(() => royaClients.id).notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  jobTitle: text("job_title"),
  lastContact: timestamp("last_contact"),
  dealValue: real("deal_value"),
  lossReason: text("loss_reason"),
  originalInterest: text("original_interest"),
  segment: contactSegmentEnum("segment"),
  state: contactStateEnum("state").default("not_contacted").notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const royaCampaigns = pgTable("roya_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  clientId: text("client_id").references(() => royaClients.id).notNull(),
  name: text("name").notNull(),
  status: text("status").default("draft").notNull(),
  channels: jsonb("channels").$type<string[]>().default([]),
  maxSteps: integer("max_steps").default(5),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const royaMessages = pgTable("roya_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  contactId: text("contact_id").references(() => royaContacts.id).notNull(),
  campaignId: text("campaign_id").references(() => royaCampaigns.id),
  direction: text("direction").notNull(),
  channel: channelEnum("channel").notNull(),
  content: text("content").notNull(),
  subject: text("subject"),
  externalId: text("external_id"),
  openedAt: timestamp("opened_at"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const royaAgentThreads = pgTable("roya_agent_threads", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  contactId: text("contact_id").references(() => royaContacts.id).notNull(),
  state: contactStateEnum("state").default("not_contacted").notNull(),
  history: jsonb("history").$type<{ role: string; content: string; timestamp: string }[]>().default([]),
  lastActivity: timestamp("last_activity").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const royaAppointments = pgTable("roya_appointments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  contactId: text("contact_id").references(() => royaContacts.id).notNull(),
  clientId: text("client_id").references(() => royaClients.id).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  dealValue: real("deal_value"),
  actualRevenue: real("actual_revenue"),
  commission: real("commission"),
  invoiceStatus: invoiceStatusEnum("invoice_status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agentJobs = pgTable("agent_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agencyId: text("agency_id").references(() => agencies.id).notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  status: text("status").default("pending").notNull(),
  result: jsonb("result"),
  error: text("error"),
  bullmqJobId: text("bullmq_job_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
