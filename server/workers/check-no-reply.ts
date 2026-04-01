// ─── Check No-Reply Worker ─────────────────────────────────────────────────────
// Fires 48h after a send. If the lead still hasn't replied:
// → Advance to next flow step and enqueue the next send_message job.
// If they DID reply: nothing to do (webhook handler already moved them forward).

import type { Job } from "bullmq";
import type { CheckNoReplyPayload } from "../../src/lib/queue";
import { enqueueSend } from "../../src/lib/queue";
import * as campaignStore from "../../src/lib/campaign-store";

export async function handleCheckNoReply(job: Job<CheckNoReplyPayload>): Promise<void> {
  const { campaignId, contactId, stepIndex } = job.data;

  const campaign = await campaignStore.getById(campaignId);
  if (!campaign || campaign.status !== "active") return;

  const contact = campaign.contacts.find(c => c.id === contactId);
  if (!contact) return;

  // If they replied or booked, do nothing
  if (["replied", "interested", "booked", "closed", "opted_out"].includes(contact.status)) {
    console.log(`[NO-REPLY] ${contact.name} already at ${contact.status} — skip`);
    return;
  }

  // If still on the step we sent (or stuck as "contacted"), advance to next step
  const nextStepIndex = stepIndex + 1;
  if (nextStepIndex >= campaign.flow.length) {
    // No more steps — close the contact
    await campaignStore.updateContactStatus(campaignId, contactId, "closed");
    console.log(`[NO-REPLY] ${contact.name} — flow exhausted, closing`);
    return;
  }

  const nextStep = campaign.flow[nextStepIndex];
  const delayMs  = nextStep.delayDays * 24 * 3600 * 1000;

  await enqueueSend(
    {
      campaignId,
      contactId,
      stepIndex:   nextStepIndex,
      channel:     contact.channel,
      contact:     contact.contact,
      leadName:    contact.name,
    },
    delayMs
  );

  console.log(
    `[NO-REPLY] ${contact.name} — step ${stepIndex} no reply → enqueued step ${nextStepIndex} in ${nextStep.delayDays}d`
  );
}
