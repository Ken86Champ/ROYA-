# ROYA SaaS — Autonomous Revenue Reactivation Platform

## Stack
- Next.js 15 + React 19 + TypeScript
- tRPC 11 for API layer
- Drizzle ORM + PostgreSQL (Supabase)
- BullMQ + Redis for agent job queues
- Anthropic Claude API for autonomous agents
- Twilio (SMS/WhatsApp) + Mailgun (Email)
- Stripe for billing

## Architecture
- Multi-tenant: platform → agency → client → contacts
- 7 specialized Claude agents (see server/agents/)
- Webhook endpoints: /api/webhooks/twilio, /api/webhooks/mailgun
- Background workers: server/worker.ts

## Agent Models
- Orchestrator: claude-opus-4-6 (adaptive thinking)
- Conversation (Sleeping Beauty): claude-opus-4-6 (adaptive thinking)
- Writer: claude-sonnet-4-6
- Segmentation: claude-haiku-4-5
- Booking: claude-haiku-4-5
- Channel Router: claude-haiku-4-5
- Analytics: claude-sonnet-4-6

## Key Files
- server/agents/ — All 7 Claude agents
- server/db/schema.ts — Database schema
- server/routers/ — tRPC routers
- src/app/ — Next.js pages
- src/components/ — React components

## Rules
- Always use protectedProcedure for auth-required tRPC endpoints
- All LLM calls go through server/agents/
- Use BullMQ queues for all background agent jobs
- Multi-tenant: always filter by tenantId/agencyId
