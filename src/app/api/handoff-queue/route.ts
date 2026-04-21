/**
 * Handoff Queue API
 *
 * GET  /api/handoff-queue          — list open/in_progress handoffs (sorted by priority)
 * POST /api/handoff-queue          — actions: claim, resolve, reopen, reply
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { send as channelSend } from '@/server/channels';
import type { ChannelType } from '@/server/channels';
import * as convStore from '@/lib/conversation-store';
import * as campaignStore from '@/lib/campaign-store';

interface HandoffRow {
  id: string;
  conversation_id: string;
  lead_id: string | null;
  priority: string;
  reason: string;
  status: string;
  payload: Record<string, unknown>;
  assigned_to: string | null;
  claimed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'open,in_progress';
  const statuses = status.split(',').map(s => s.trim());
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '50'), 200);

  const { data: rows, error } = await supabase
    .from('handoff_queue')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with conversation details
  const handoffs = await Promise.all(
    (rows ?? []).map(async (row: HandoffRow) => {
      let conversation = null;
      if (row.conversation_id) {
        conversation = await convStore.getById(row.conversation_id);
      }
      return {
        id: row.id,
        conversationId: row.conversation_id,
        leadId: row.lead_id,
        priority: row.priority,
        reason: row.reason,
        status: row.status,
        assignedTo: row.assigned_to,
        claimedAt: row.claimed_at,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        // From payload
        leadName: (row.payload as Record<string, unknown>)?.leadName as string || 'Unbekannt',
        leadContact: (row.payload as Record<string, unknown>)?.leadContact as string || '',
        channel: (row.payload as Record<string, unknown>)?.channel as string || 'sms',
        incomingMessage: (row.payload as Record<string, unknown>)?.incomingMessage as string || '',
        suggestedReply: (row.payload as Record<string, unknown>)?.suggestedReply as string || '',
        interpretation: (row.payload as Record<string, unknown>)?.interpretation,
        // From conversation
        conversationState: conversation?.state || null,
        messageCount: conversation?.messages?.length || 0,
        lastMessages: conversation?.messages?.slice(-5) || [],
        waitingMinutes: Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000),
      };
    }),
  );

  // Sort by priority, then age
  handoffs.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // oldest first
  });

  // Stats
  const stats = {
    total: handoffs.length,
    open: handoffs.filter(h => h.status === 'open').length,
    inProgress: handoffs.filter(h => h.status === 'in_progress').length,
    urgent: handoffs.filter(h => h.priority === 'urgent').length,
    high: handoffs.filter(h => h.priority === 'high').length,
    avgWaitMinutes: handoffs.length > 0
      ? Math.round(handoffs.reduce((s, h) => s + h.waitingMinutes, 0) / handoffs.length)
      : 0,
  };

  return NextResponse.json({ handoffs, stats });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, handoffId } = body as { action: string; handoffId: string };

  if (!action || !handoffId) {
    return NextResponse.json({ error: 'action and handoffId required' }, { status: 400 });
  }

  // Fetch handoff
  const { data: handoff, error: fetchErr } = await supabase
    .from('handoff_queue')
    .select('*')
    .eq('id', handoffId)
    .single();

  if (fetchErr || !handoff) {
    return NextResponse.json({ error: 'Handoff not found' }, { status: 404 });
  }

  const payload = handoff.payload as Record<string, unknown> || {};

  switch (action) {
    // ── Claim: mark as in_progress ──
    case 'claim': {
      const agent = (body.agentName as string) || 'Agent';
      await supabase.from('handoff_queue').update({
        status: 'in_progress',
        assigned_to: agent,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', handoffId);
      return NextResponse.json({ ok: true, status: 'in_progress', assignedTo: agent });
    }

    // ── Reply: send message via channel and persist ──
    case 'reply': {
      const message = body.message as string;
      if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

      const leadContact = payload.leadContact as string;
      const channel = (payload.channel as string) || 'sms';
      const leadName = (payload.leadName as string) || 'Lead';

      if (!leadContact) {
        return NextResponse.json({ error: 'No contact address on handoff' }, { status: 400 });
      }

      // Send via channel abstraction
      const sendResult = await channelSend({
        to: leadContact,
        body: message,
        channel: channel as ChannelType,
        subject: `Antwort von ${body.agentName || 'Support'}`,
      });

      if (!sendResult.success) {
        return NextResponse.json({
          error: `Send failed: ${sendResult.error}`,
          provider: sendResult.provider,
        }, { status: 502 });
      }

      // Persist message in conversation
      if (handoff.conversation_id) {
        await convStore.addMessage(
          handoff.conversation_id,
          'agent',
          message,
          channel as 'sms' | 'whatsapp' | 'email',
        );
      }

      // Auto-claim if not claimed yet
      if (handoff.status === 'open') {
        await supabase.from('handoff_queue').update({
          status: 'in_progress',
          assigned_to: (body.agentName as string) || 'Agent',
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', handoffId);
      }

      return NextResponse.json({
        ok: true,
        messageId: sendResult.messageId,
        provider: sendResult.provider,
      });
    }

    // ── Resolve: mark as resolved, optionally resume campaign ──
    case 'resolve': {
      const resolution = (body.resolution as string) || 'resolved';
      await supabase.from('handoff_queue').update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payload: { ...payload, resolution },
      }).eq('id', handoffId);

      // Resume campaign contact if requested
      if (body.resumeCampaign && handoff.conversation_id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('campaign_id, lead_contact')
          .eq('id', handoff.conversation_id)
          .single();

        if (conv?.campaign_id) {
          const { data: contacts } = await supabase
            .from('campaign_contacts')
            .select('id')
            .eq('campaign_id', conv.campaign_id)
            .eq('contact', conv.lead_contact)
            .eq('status', 'human_escalated');

          if (contacts?.length) {
            const newStatus = resolution === 'booked' ? 'booked' : 'contacted';
            await supabase.from('campaign_contacts').update({
              status: newStatus,
            }).eq('id', contacts[0].id);
          }
        }
      }

      return NextResponse.json({ ok: true, status: 'resolved', resolution });
    }

    // ── Reopen ──
    case 'reopen': {
      await supabase.from('handoff_queue').update({
        status: 'open',
        assigned_to: null,
        claimed_at: null,
        resolved_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', handoffId);
      return NextResponse.json({ ok: true, status: 'open' });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
