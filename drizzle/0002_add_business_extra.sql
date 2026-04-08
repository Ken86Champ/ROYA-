-- Migration: Add business_extra JSONB column for extended business context
-- Run this in Supabase SQL Editor

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS business_extra JSONB DEFAULT '{}'::jsonb;

-- This column stores structured fields not covered by existing text columns:
-- industry, companyDescription, location, usps, allServices, priceRange,
-- specialOffer, leadRelationship, afterCta, urgency, objections[],
-- doNotSay, insiderKnowledge, exampleConversation
