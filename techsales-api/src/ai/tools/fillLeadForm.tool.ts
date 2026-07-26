/**
 * Gap 4 — `fill_lead_form`. Atlas stages values into the lead form UI.
 *
 * Emits the SAME fill_field/add_drug actions the live-call pipeline
 * produces, so the existing consumption machinery does the rest: on the
 * lead form the fields fill instantly with "AI" chips; elsewhere the
 * capture nudge points the agent to the form. The DATABASE is never
 * touched — the agent reviews and saves. (Persisted edits to existing
 * records stay with propose_lead_update + approval.)
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/** Fields the LeadForm actually renders — keep in sync with the FE form. */
const FILLABLE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'dob',
  'gender',
  'address1',
  'address2',
  'city',
  'state',
  'county',
  'zipCode',
  'medicareNumber',
  'medicaidId',
  'partADate',
  'partBDate',
] as const;

const inputSchema = z.object({
  userId: z.string().min(1).describe("The requesting agent's userId. Required."),
  fields: z
    .record(z.string(), z.string())
    .describe(
      'Field → value map. Allowed fields: ' + FILLABLE_FIELDS.join(', ') + '. ' +
        'Dates as YYYY-MM-DD; state as 2-letter code; phone as digits.',
    ),
  drugs: z
    .array(
      z.object({
        drugName: z.string().min(1),
        dosage: z.string().optional(),
        frequency: z.string().optional(),
      }),
    )
    .optional()
    .describe('Medications to tag on the lead (matched against the drug catalog).'),
  note: z.string().max(500).optional().describe('A note line to append to the form notes.'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const fillLeadFormTool = tool(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (input: ToolInput): Promise<string> => {
    const allowed = new Set<string>(FILLABLE_FIELDS);
    const accepted: Record<string, string> = {};
    const rejected: string[] = [];
    for (const [field, value] of Object.entries(input.fields ?? {})) {
      if (allowed.has(field) && typeof value === 'string' && value.trim()) {
        accepted[field] = value.trim();
      } else {
        rejected.push(field);
      }
    }
    const drugs = (input.drugs ?? []).filter((d) => d.drugName?.trim());
    if (Object.keys(accepted).length === 0 && drugs.length === 0 && !input.note) {
      return JSON.stringify({
        error: 'No valid fields to stage.',
        allowedFields: FILLABLE_FIELDS,
        rejected,
      });
    }
    // Marshaled by the agent into a `form_fill` SSE event.
    return JSON.stringify({
      formFill: {
        fields: accepted,
        ...(drugs.length > 0 ? { drugs } : {}),
        ...(input.note ? { note: input.note } : {}),
      },
      note:
        `Staged ${Object.keys(accepted).length} field(s)` +
        (drugs.length > 0 ? ` + ${drugs.length} drug(s)` : '') +
        '. The values appear in the lead form for the agent to review and save — ' +
        'nothing is written to the database until they save. If the agent is not on ' +
        'the form, a nudge points them there.',
      ...(rejected.length > 0 ? { rejectedFields: rejected } : {}),
    });
  },
  {
    name: 'fill_lead_form',
    description:
      "STAGE values into the lead form UI (new-lead creation or edits the agent dictates) — " +
      'fields fill with AI markers and the AGENT reviews + saves; the database is never touched ' +
      'directly. Use when the agent dictates lead details ("new lead: Maria Lopez, phone 555-1234, ' +
      'zip 33101") or asks you to prep the form. Pair with navigate_to("/leads/new") when they are ' +
      'not already on a form. For changing EXISTING saved records use propose_lead_update instead.',
    schema: inputSchema,
  },
);
