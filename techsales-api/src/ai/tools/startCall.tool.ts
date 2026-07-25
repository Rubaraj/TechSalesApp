/**
 * Gap 1 — `start_call`. Atlas can dial for the agent. The dialer lives in
 * the BROWSER (Twilio Device), so this tool returns a `{dial}` payload the
 * SSE bridge marshals into a `dial` event; the FE dials immediately in
 * Auto Pilot or renders a click-to-call card in Assist.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The requesting agent's userId. Required."),
  leadId: z
    .string()
    .optional()
    .describe('Dial this lead (preferred — resolves their phone + name). Use search_leads first for names.'),
  phone: z
    .string()
    .optional()
    .describe('Raw phone number to dial when there is no lead (e.g. "959-248-0333").'),
});

type ToolInput = z.infer<typeof inputSchema>;

/** Digits → +1XXXXXXXXXX (mirrors the FE PhoneButton normalization). */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

export const startCallTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      let to: string | null = null;
      let leadId: string | undefined;
      let leadName: string | undefined;

      if (input.leadId) {
        const lead = await repos.lead.findById(input.leadId);
        if (!lead) return JSON.stringify({ error: `Lead ${input.leadId} not found.` });
        if (!lead.phone) {
          return JSON.stringify({ error: `${lead.firstName} ${lead.lastName} has no phone number on file.` });
        }
        to = toE164(lead.phone);
        leadId = lead.leadId;
        leadName = `${lead.firstName} ${lead.lastName}`.trim();
      } else if (input.phone) {
        to = toE164(input.phone);
      } else {
        return JSON.stringify({ error: 'Provide either leadId or phone.' });
      }

      if (!to) {
        return JSON.stringify({ error: 'That phone number is not dialable (need 10 digits).' });
      }

      // Payload marshalled by the agent into a `dial` SSE event.
      return JSON.stringify({
        dial: { to, ...(leadId ? { leadId } : {}), ...(leadName ? { leadName } : {}) },
        note:
          'Dial request sent to the dialer. In Assist mode the agent must click Call; ' +
          'in Auto Pilot the call is being placed now.',
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'start_call',
    description:
      'Place an outbound call through the agent\'s browser dialer. For "call John Smith" style ' +
      'requests, resolve the name with search_leads FIRST, then pass leadId (dials their number ' +
      'and binds the call to the lead). Pass raw `phone` only when there is no lead. The FE\'s ' +
      'autonomy mode decides: Assist renders a click-to-call card; Auto Pilot dials immediately. ' +
      'Never call this unless the agent asked to place a call.',
    schema: inputSchema,
  },
);
