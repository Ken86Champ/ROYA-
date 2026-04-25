/**
 * POST /api/setup-agent/save
 * Saves the completed RoyaGPT setup as a prompt_frameworks entry
 * and optionally pre-fills agency_settings.config.persona.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase, genId } from '@/lib/supabase';

interface SetupData {
  agentName?: string;
  agentRole?: string;
  companyName?: string;
  industry?: string;
  offer?: string;
  allServices?: string;
  valueProp?: string;
  priceRange?: string;
  specialOffer?: string;
  targetAudience?: string;
  painPoint?: string;
  noConvertReason?: string;
  cta?: string;
  afterCta?: string;
  bookingType?: string;
  urgency?: string;
  doNotSay?: string;
  insiderKnowledge?: string;
  exampleConversation?: string;
  language?: string;
  tone?: string;
  writerInstructions?: string;
  strategistInstructions?: string;
  interpreterInstructions?: string;
  forbiddenPhrases?: string[];
  rules?: string[];
  objections?: { objection: string; response: string }[];
  escalationTriggers?: string;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  try {
    const { setupData, frameworkName, campaignId, agencyId = 'demo-agency' }: {
      setupData: SetupData;
      frameworkName?: string;
      campaignId?: string;
      agencyId?: string;
    } = await req.json();

    if (!setupData) {
      return NextResponse.json({ error: 'setupData required' }, { status: 400 });
    }

    const frameworkId = genId('fw');
    const name = frameworkName || `${setupData.companyName || 'Unbekannt'} — Setup`;

    // 1. Save prompt framework
    const { error: fwError } = await supabase.from('prompt_frameworks').insert({
      id: frameworkId,
      agency_id: agencyId,
      name,
      description: `Automatisch erstellt durch RoyaGPT Setup für ${setupData.companyName || 'Unbekannt'}`,
      is_system: false,
      writer_instructions: setupData.writerInstructions || '',
      strategist_instructions: setupData.strategistInstructions || '',
      interpreter_instructions: setupData.interpreterInstructions || '',
      rules: setupData.rules || [],
      forbidden_phrases: setupData.forbiddenPhrases || [],
      temperature: setupData.temperature ?? 0.7,
      example_messages: [],
    });

    if (fwError) {
      console.error('[ROYA] save framework error:', fwError);
      return NextResponse.json({ error: fwError.message }, { status: 500 });
    }

    // 2. Build business_extra from setupData
    const businessExtra = {
      industry:           setupData.industry,
      companyDescription: setupData.targetAudience,
      usps:               setupData.valueProp,
      allServices:        setupData.allServices,
      priceRange:         setupData.priceRange,
      specialOffer:       setupData.specialOffer,
      leadRelationship:   'former_customer',
      afterCta:           setupData.afterCta,
      urgency:            setupData.urgency,
      objections:         setupData.objections || [],
      doNotSay:           setupData.doNotSay,
      insiderKnowledge:   setupData.insiderKnowledge,
      exampleConversation:setupData.exampleConversation,
    };

    // 3. Link to campaign if provided
    if (campaignId) {
      const { error: campError } = await supabase
        .from('campaigns')
        .update({
          framework_id:      frameworkId,
          agent_name:        setupData.agentName,
          agent_tone:        setupData.tone,
          company_name:      setupData.companyName,
          offer:             setupData.offer,
          value_prop:        setupData.valueProp,
          pain_point:        setupData.painPoint,
          no_convert_reason: setupData.noConvertReason,
          cta:               setupData.cta,
          business_extra:    businessExtra,
        })
        .eq('id', campaignId);

      if (campError) {
        console.error('[ROYA] campaign update error:', campError);
      }
    }

    // 4. Update agency_settings persona defaults
    const { data: existingSettings } = await supabase
      .from('agency_settings')
      .select('config')
      .eq('agency_id', agencyId)
      .single();

    const existing = (existingSettings?.config as Record<string, unknown>) ?? {};
    const updatedConfig = {
      ...existing,
      persona: {
        ...((existing.persona as Record<string, unknown>) ?? {}),
        agentName:    setupData.agentName,
        companyName:  setupData.companyName,
        industry:     setupData.industry,
        tone:         setupData.tone,
        language:     setupData.language || 'du',
      },
      activeFrameworkId: frameworkId,
    };

    await supabase
      .from('agency_settings')
      .upsert({ agency_id: agencyId, config: updatedConfig })
      .eq('agency_id', agencyId);

    return NextResponse.json({ frameworkId, success: true });
  } catch (err) {
    console.error('[ROYA] setup save error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
