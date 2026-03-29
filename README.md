# ROYA — Revenue Reactivation SaaS

Autonomous B2B lead reactivation platform powered by a 6-agent AI pipeline.

## What it does

ROYA reactivates lost pipeline leads through hyper-personalized, AI-driven outreach — fully automated, no manual effort.

**Pipeline:** CSV Upload → AI Segmentation → Personalized Outreach → Multi-turn Conversation → Booking

## 6-Agent Architecture

| Agent | Model | Role |
|---|---|---|
| Data Interpreter | Haiku 4.5 | Analyses lead data quality and completeness |
| Context Reconstruction | Sonnet 4.6 | Reconstructs lead history and funnel stage |
| Segmentation | Haiku 4.5 | Classifies lead segment and drop-off hypothesis |
| Personalization | Sonnet 4.6 | Defines tone, messaging angle and key hooks |
| Conversation Engine | Opus 4.6 | Generates message variations and full conversation flow |
| Quality Control | Sonnet 4.6 | Scores humanization, personalization and relevance |

## Features

- **Test Agent Flow** — Live simulation of the full 6-agent pipeline with animated visualization
- **Lead Reactivation Wizard** — CSV upload → column mapping → segmentation → outreach generation
- **Multi-turn Conversation Engine** — Full conversation simulation through to appointment booking
- **5 Response States** — Interested, Neutral, Already Solved, Not Interested, No Response
- **3 Channels** — Email, WhatsApp, SMS
- **Quality Control Scoring** — Human score, personalization score, relevance, naturalness

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS v4
- **AI:** Anthropic Claude (Opus 4.6, Sonnet 4.6, Haiku 4.5)
- **Database:** PostgreSQL + Drizzle ORM
- **Queues:** BullMQ

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
  app/dashboard/
    simulation/     # Test Agent Flow
    leads/          # Lead Reactivation Wizard
    campaigns/      # Campaign management
    conversations/  # Agent conversation monitor
  lib/
    reactivation-engine.ts  # Core engine (shared by all pages)
server/
  agents/           # 7 specialized AI agents
  db/               # Database schema
  queues/           # Job processing
```

---

Built with [Claude Code](https://claude.ai/code)
